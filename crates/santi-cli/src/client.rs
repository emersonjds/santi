use std::fmt;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::Duration;

use reqwest::multipart::{Form, Part};
use reqwest::{Method, RequestBuilder, Response, Url};
use santi_types::attachments::Attachment;
use santi_types::auth::User;
use santi_types::boards::{Backlog, BoardSettings, BoardView};
use santi_types::imports::{ImportMapping, ImportPreview, ImportResult};
use santi_types::issues::{
    Comment, CreateComment, CreateIssue, Issue, IssueFilter, MoveIssue, Page, PageParams,
    StatusFilter, UpdateComment, UpdateIssue,
};
use santi_types::projects::{CreateProject, InviteInfo, MemberInfo, Project, ProjectState};
use santi_types::reports::SprintReport;
use santi_types::sprints::{CompleteSprint, CreateSprint, Sprint, StartSprint};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::error::{Error, problem_from};

/// What the server accepts (D53) that can be checked without reading the bytes.
const ATTACHABLE: [&str; 16] = [
    "png", "jpg", "jpeg", "gif", "webp", "pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "zip",
    "txt", "csv", "md",
];
const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD: usize = 10;

/// The one typed client of the JSON API; the CLI and the MCP server both go through it.
#[derive(Clone)]
pub struct Client {
    http: reqwest::Client,
    base: Url,
    token: Option<String>,
}

impl Client {
    pub fn new(url: &str, token: Option<String>) -> Result<Client, Error> {
        Client::with_read_timeout(url, token, Duration::from_secs(30))
    }

    /// Pooled connections are dropped before the hosting proxy's idle cutoff; a server that
    /// went away during a redeploy fails the read instead of hanging the long-lived MCP process.
    fn with_read_timeout(
        url: &str,
        token: Option<String>,
        read_timeout: Duration,
    ) -> Result<Client, Error> {
        let base = Url::parse(url)
            .map_err(|error| Error::Usage(format!("`{url}` is not a server URL: {error}")))?;
        let http = reqwest::Client::builder()
            .user_agent(concat!("santi-cli/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(read_timeout)
            .pool_idle_timeout(Duration::from_secs(30))
            .build()
            .map_err(|error| Error::Other(error.to_string()))?;
        Ok(Client { http, base, token })
    }

    /// The server URL without its user and password, for messages.
    pub fn shown_url(&self) -> Url {
        let mut url = self.base.clone();
        url.set_username("").ok();
        url.set_password(None).ok();
        url
    }

    /// `http://` to anything but this machine sends the token in the clear.
    pub fn is_plain_http_to_another_host(&self) -> bool {
        let host = self.base.host_str().unwrap_or_default();
        let loopback = host
            .trim_matches(['[', ']'])
            .parse::<std::net::IpAddr>()
            .map_or(host.eq_ignore_ascii_case("localhost"), |ip| {
                ip.is_loopback()
            });
        self.base.scheme() == "http" && !loopback
    }

    /// The same server, acting as another user (Streamable HTTP passes each caller's token).
    pub fn with_token(&self, token: Option<String>) -> Client {
        Client {
            token,
            ..self.clone()
        }
    }

    pub async fn me(&self) -> Result<User, Error> {
        self.send(self.request(Method::GET, &["me"])).await
    }

    pub async fn projects(&self, state: ProjectState) -> Result<Vec<Project>, Error> {
        let request = self.request(Method::GET, &["projects"]);
        self.send(request.query(&[("state", state)])).await
    }

    pub async fn create_project(&self, project: &CreateProject) -> Result<Project, Error> {
        let request = self.request(Method::POST, &["projects"]);
        self.send(request.json(project)).await
    }

    /// `archive`, `unarchive`, `trash` or `restore`.
    pub async fn change_project(&self, project: &ProjectKey, action: &str) -> Result<(), Error> {
        let request = self.request(Method::POST, &["projects", project.as_str(), action]);
        self.send(request).await
    }

    pub async fn purge_project(&self, project: &ProjectKey) -> Result<(), Error> {
        let request = self.request(Method::DELETE, &["projects", project.as_str()]);
        self.send(request).await
    }

    pub async fn board(&self, project: &ProjectKey) -> Result<BoardView, Error> {
        let request = self.request(Method::GET, &["projects", project.as_str(), "board"]);
        self.send(request).await
    }

    pub async fn backlog(&self, project: &ProjectKey) -> Result<Backlog, Error> {
        let request = self.request(Method::GET, &["projects", project.as_str(), "backlog"]);
        self.send(request).await
    }

    pub async fn members(&self, project: &ProjectKey) -> Result<Vec<MemberInfo>, Error> {
        let request = self.request(Method::GET, &["projects", project.as_str(), "members"]);
        self.send(request).await
    }

    pub async fn invites(&self, project: &ProjectKey) -> Result<Vec<InviteInfo>, Error> {
        let request = self.request(Method::GET, &["projects", project.as_str(), "invites"]);
        self.send(request).await
    }

    pub async fn revoke_invite(&self, project: &ProjectKey, id: i64) -> Result<(), Error> {
        let id = id.to_string();
        let path = ["projects", project.as_str(), "invites", &id];
        self.send(self.request(Method::DELETE, &path)).await
    }

    pub async fn issues(
        &self,
        project: &ProjectKey,
        filter: &IssueFilter,
        status: &StatusFilter,
        page: &PageParams,
    ) -> Result<Page<Issue>, Error> {
        let mut query = to_query(filter);
        query.extend(to_query(status));
        query.extend(to_query(page));
        let request = self.request(Method::GET, &["projects", project.as_str(), "issues"]);
        self.send(request.query(&query)).await
    }

    pub async fn issue(&self, key: &IssueKey) -> Result<Issue, Error> {
        self.send(self.issue_request(Method::GET, key, &[])).await
    }

    pub async fn create_issue(
        &self,
        project: &ProjectKey,
        issue: &CreateIssue,
    ) -> Result<Issue, Error> {
        let request = self.request(Method::POST, &["projects", project.as_str(), "issues"]);
        self.send(request.json(issue)).await
    }

    pub async fn update_issue(
        &self,
        key: &IssueKey,
        changes: &UpdateIssue,
    ) -> Result<Issue, Error> {
        let request = self.issue_request(Method::PATCH, key, &[]);
        self.send(request.json(changes)).await
    }

    pub async fn move_issue(&self, key: &IssueKey, change: &MoveIssue) -> Result<Issue, Error> {
        let request = self.issue_request(Method::POST, key, &["move"]);
        self.send(request.json(change)).await
    }

    pub async fn delete_issue(&self, key: &IssueKey) -> Result<(), Error> {
        self.send(self.issue_request(Method::DELETE, key, &[]))
            .await
    }

    pub async fn comment(&self, key: &IssueKey, body: &str) -> Result<Comment, Error> {
        let request = self.issue_request(Method::POST, key, &["comments"]);
        let body = CreateComment { body: body.into() };
        self.send(request.json(&body)).await
    }

    pub async fn comments(
        &self,
        key: &IssueKey,
        page: &PageParams,
    ) -> Result<Page<Comment>, Error> {
        let request = self.issue_request(Method::GET, key, &["comments"]);
        self.send(request.query(&to_query(page))).await
    }

    pub async fn edit_comment(
        &self,
        key: &IssueKey,
        id: i64,
        body: &str,
    ) -> Result<Comment, Error> {
        let id = id.to_string();
        let request = self.issue_request(Method::PATCH, key, &["comments", &id]);
        let body = UpdateComment { body: body.into() };
        self.send(request.json(&body)).await
    }

    pub async fn delete_comment(&self, key: &IssueKey, id: i64) -> Result<(), Error> {
        let id = id.to_string();
        self.send(self.issue_request(Method::DELETE, key, &["comments", &id]))
            .await
    }

    /// Every comment, oldest first, following the cursor to the last page.
    pub async fn all_comments(&self, key: &IssueKey) -> Result<Vec<Comment>, Error> {
        let mut comments = Vec::new();
        let mut page = PageParams {
            limit: Some(200),
            cursor: None,
        };
        loop {
            let next = self.comments(key, &page).await?;
            comments.extend(next.items);
            match next.next_cursor {
                Some(cursor) if page.cursor != Some(cursor) => page.cursor = Some(cursor),
                _ => return Ok(comments),
            }
        }
    }

    pub async fn attachments(&self, key: &IssueKey) -> Result<Vec<Attachment>, Error> {
        self.send(self.issue_request(Method::GET, key, &["attachments"]))
            .await
    }

    /// Streams `files` from disk after the checks the server would fail them on.
    pub async fn attach(
        &self,
        key: &IssueKey,
        files: &[PathBuf],
        comment_id: Option<i64>,
    ) -> Result<Vec<Attachment>, Error> {
        if files.len() > MAX_FILES_PER_UPLOAD {
            return Err(Error::Usage("At most 10 files per upload.".into()));
        }
        let mut form = Form::new();
        for file in files {
            form = form.part("file", attachable(file).await?);
        }
        if let Some(comment_id) = comment_id {
            form = form.text("comment_id", comment_id.to_string());
        }
        let request = self.issue_request(Method::POST, key, &["attachments"]);
        self.send(request.multipart(form)).await
    }

    /// The file's bytes, after following the redirect to storage.
    pub async fn download(&self, key: &IssueKey, id: i64) -> Result<Response, Error> {
        let id = id.to_string();
        let request = self.issue_request(Method::GET, key, &["attachments", &id]);
        self.response(request.query(&[("download", 1)])).await
    }

    pub async fn delete_attachment(&self, key: &IssueKey, id: i64) -> Result<(), Error> {
        let id = id.to_string();
        self.send(self.issue_request(Method::DELETE, key, &["attachments", &id]))
            .await
    }

    pub async fn sprints(&self, project: &ProjectKey) -> Result<Vec<Sprint>, Error> {
        let request = self.request(Method::GET, &["projects", project.as_str(), "sprints"]);
        self.send(request).await
    }

    pub async fn create_sprint(
        &self,
        project: &ProjectKey,
        sprint: &CreateSprint,
    ) -> Result<Sprint, Error> {
        let request = self.request(Method::POST, &["projects", project.as_str(), "sprints"]);
        self.send(request.json(sprint)).await
    }

    pub async fn start_sprint(
        &self,
        project: &ProjectKey,
        sprint: i64,
        dates: &StartSprint,
    ) -> Result<Sprint, Error> {
        let id = sprint.to_string();
        let request = self.request(
            Method::POST,
            &["projects", project.as_str(), "sprints", &id, "start"],
        );
        self.send(request.json(dates)).await
    }

    pub async fn sprint_report(
        &self,
        project: &ProjectKey,
        sprint: i64,
    ) -> Result<SprintReport, Error> {
        let id = sprint.to_string();
        let request = self.request(
            Method::GET,
            &["projects", project.as_str(), "sprints", &id, "report"],
        );
        self.send(request).await
    }

    pub async fn complete_sprint(
        &self,
        project: &ProjectKey,
        sprint: i64,
        complete: &CompleteSprint,
    ) -> Result<Sprint, Error> {
        let id = sprint.to_string();
        let path = ["projects", project.as_str(), "sprints", &id, "complete"];
        self.send(self.request(Method::POST, &path).json(complete))
            .await
    }

    /// A status id from its id or its name as the board shows it, ignoring case.
    pub async fn status_id(&self, project: &ProjectKey, status: &str) -> Result<i64, Error> {
        let request = self.request(
            Method::GET,
            &["projects", project.as_str(), "board", "settings"],
        );
        let settings: BoardSettings = self.send(request).await?;
        let statuses: Vec<_> = settings
            .columns
            .into_iter()
            .flat_map(|column| column.statuses)
            .chain(settings.unmapped)
            .collect();
        let found = statuses.iter().find(|candidate| {
            candidate.name.eq_ignore_ascii_case(status.trim()) || candidate.id.to_string() == status
        });
        if let Some(found) = found {
            return Ok(found.id);
        }
        let names: Vec<&str> = statuses.iter().map(|status| status.name.as_str()).collect();
        Err(Error::Usage(format!(
            "no status `{status}` in {project}; statuses: {}",
            names.join(", ")
        )))
    }

    pub async fn import_preview(
        &self,
        project: &ProjectKey,
        csv: Vec<u8>,
    ) -> Result<ImportPreview, Error> {
        let form = reqwest::multipart::Form::new().part("file", csv_part(csv));
        let path = ["projects", project.as_str(), "imports", "preview"];
        self.send(self.request(Method::POST, &path).multipart(form))
            .await
    }

    pub async fn import(
        &self,
        project: &ProjectKey,
        csv: Vec<u8>,
        mapping: &ImportMapping,
    ) -> Result<ImportResult, Error> {
        let mapping =
            serde_json::to_string(mapping).map_err(|error| Error::Other(error.to_string()))?;
        let form = reqwest::multipart::Form::new()
            .part("file", csv_part(csv))
            .text("mapping", mapping);
        let request = self.request(Method::POST, &["projects", project.as_str(), "imports"]);
        self.send(request.multipart(form)).await
    }

    fn issue_request(&self, method: Method, key: &IssueKey, tail: &[&str]) -> RequestBuilder {
        let number = key.number.to_string();
        let mut path = vec!["projects", key.project.as_str(), "issues", &number];
        path.extend(tail);
        self.request(method, &path)
    }

    /// `segments` are appended to `<base>/api`, each percent-encoded.
    fn request(&self, method: Method, segments: &[&str]) -> RequestBuilder {
        let mut url = self.base.clone();
        if let Ok(mut path) = url.path_segments_mut() {
            path.pop_if_empty().push("api").extend(segments);
        }
        let request = self.http.request(method, url);
        match &self.token {
            Some(token) => request.bearer_auth(token),
            None => request,
        }
    }

    /// One retry on a network error: always when the request never connected, otherwise only
    /// for idempotent methods, since a write may already have reached the server.
    async fn execute(&self, request: RequestBuilder) -> Result<reqwest::Response, reqwest::Error> {
        let request = request.build()?;
        let idempotent = request.method().is_idempotent();
        let retry = request.try_clone();
        match (self.http.execute(request).await, retry) {
            (Err(error), Some(retry)) if error.is_connect() || idempotent => {
                self.http.execute(retry).await
            }
            (sent, _) => sent,
        }
    }

    fn network(&self, error: reqwest::Error) -> Error {
        Error::Network(format!(
            "cannot reach santi at {}: {error}",
            self.shown_url()
        ))
    }

    /// A successful response, or the API's problem as the error.
    async fn response(&self, request: RequestBuilder) -> Result<Response, Error> {
        let network = |error| self.network(error);
        let response = self.execute(request).await.map_err(network)?;
        let status = response.status();
        if status.is_success() {
            return Ok(response);
        }
        let body = response.bytes().await.map_err(network)?;
        Err(Error::Api(problem_from(status.as_u16(), &body)))
    }

    async fn send<T: DeserializeOwned>(&self, request: RequestBuilder) -> Result<T, Error> {
        let response = self.response(request).await?;
        let body = response
            .bytes()
            .await
            .map_err(|error| self.network(error))?;
        let body = if body.is_empty() { &b"null"[..] } else { &body };
        serde_json::from_slice(body).map_err(|error| {
            let url = self.shown_url();
            Error::Other(format!("unexpected answer from {url}: {error}"))
        })
    }
}

async fn attachable(path: &Path) -> Result<Part, Error> {
    let refused = |reason: &dyn fmt::Display| Error::Usage(format!("{}: {reason}", path.display()));
    let file = tokio::fs::File::open(path)
        .await
        .map_err(|error| refused(&error))?;
    let metadata = file.metadata().await.map_err(|error| refused(&error))?;
    if !metadata.is_file() {
        return Err(refused(&"not a file"));
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Err(refused(&"Larger than 25 MB."));
    }
    let name = path
        .file_name()
        .map_or(String::new(), |name| name.to_string_lossy().into_owned());
    let extension = name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase());
    if !extension.is_some_and(|extension| ATTACHABLE.contains(&extension.as_str())) {
        return Err(refused(&"This file type is not allowed."));
    }
    Ok(Part::stream_with_length(file, metadata.len()).file_name(name))
}

fn csv_part(csv: Vec<u8>) -> reqwest::multipart::Part {
    reqwest::multipart::Part::bytes(csv).file_name("export.csv")
}

/// `WEB`: ASCII letters and digits, uppercased, so it is always one plain path segment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectKey(String);

impl ProjectKey {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl FromStr for ProjectKey {
    type Err = String;

    fn from_str(text: &str) -> Result<ProjectKey, String> {
        if text.is_empty() || !text.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(format!(
                "`{text}` is not a project key; use letters and digits, e.g. WEB"
            ));
        }
        Ok(ProjectKey(text.to_ascii_uppercase()))
    }
}

impl fmt::Display for ProjectKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// `WEB-12`: project key `WEB`, issue number 12.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IssueKey {
    pub project: ProjectKey,
    pub number: i64,
}

impl FromStr for IssueKey {
    type Err = String;

    fn from_str(text: &str) -> Result<IssueKey, String> {
        let invalid = || format!("`{text}` is not an issue key; use PROJECT-NUMBER, e.g. WEB-12");
        let (project, number) = text.rsplit_once('-').ok_or_else(invalid)?;
        let number: i64 = number.parse().map_err(|_| invalid())?;
        let project = project.parse().map_err(|_| invalid())?;
        if number < 1 {
            return Err(invalid());
        }
        Ok(IssueKey { project, number })
    }
}

impl fmt::Display for IssueKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}-{}", self.project, self.number)
    }
}

/// Query pairs from a filter DTO: arrays repeat the key (`type=bug&type=task`), null and false
/// are left out.
pub fn to_query(value: &impl Serialize) -> Vec<(String, String)> {
    let Ok(Value::Object(fields)) = serde_json::to_value(value) else {
        return vec![];
    };
    let mut pairs = vec![];
    for (key, value) in fields {
        let values = match value {
            Value::Array(values) => values,
            value => vec![value],
        };
        for value in values {
            let text = match value {
                Value::Null | Value::Bool(false) => continue,
                Value::String(text) => text,
                other => other.to_string(),
            };
            pairs.push((key.clone(), text));
        }
    }
    pairs
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use santi_types::issues::{IssueFilter, IssueType, PageParams};

    use super::*;

    #[test]
    fn issue_key_splits_project_and_number() {
        let key: IssueKey = "web-12".parse().unwrap();
        assert_eq!(
            key,
            IssueKey {
                project: "WEB".parse().unwrap(),
                number: 12
            }
        );
        assert_eq!(key.to_string(), "WEB-12");
    }

    #[test]
    fn malformed_issue_keys_are_rejected() {
        for text in ["WEB", "WEB-", "-3", "WEB-x", "WEB-0", "W/B-1"] {
            let error = text.parse::<IssueKey>().unwrap_err();
            assert!(error.contains("PROJECT-NUMBER"), "{text}: {error}");
        }
    }

    #[test]
    fn filters_become_repeated_query_pairs() {
        let filter = IssueFilter {
            issue_type: vec![IssueType::Bug, IssueType::Task],
            q: Some("login".into()),
            ..IssueFilter::default()
        };
        let pairs = to_query(&filter);
        let expected = [("q", "login"), ("type", "bug"), ("type", "task")]
            .map(|(key, value)| (key.to_string(), value.to_string()));
        assert_eq!(pairs, expected);
    }

    #[test]
    fn numbers_and_true_flags_are_kept() {
        let filter = IssueFilter {
            assignee: vec![4],
            recently_updated: true,
            ..IssueFilter::default()
        };
        let page = PageParams {
            limit: Some(20),
            cursor: None,
        };
        let mut pairs = to_query(&filter);
        pairs.extend(to_query(&page));
        let expected = [
            ("assignee", "4"),
            ("recently_updated", "true"),
            ("limit", "20"),
        ]
        .map(|(key, value)| (key.to_string(), value.to_string()));
        assert_eq!(pairs, expected);
    }

    #[tokio::test]
    async fn all_comments_stops_when_the_cursor_repeats() {
        let calls = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter = calls.clone();
        let page = move || {
            counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            async {
                axum::Json(serde_json::json!({
                    "items": [{ "id": 1, "author_id": 1, "author_name": "ana", "body": "hi",
                        "created_at": "2026-10-16T12:00:00Z" }],
                    "next_cursor": 7,
                }))
            }
        };
        let router = axum::Router::new().route(
            "/api/projects/WEB/issues/1/comments",
            axum::routing::get(page),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async { axum::serve(listener, router).await });
        let client = Client::new(&format!("http://{address}"), None).unwrap();

        let comments = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            client.all_comments(&"WEB-1".parse().unwrap()),
        )
        .await
        .expect("a repeated cursor must not loop forever")
        .unwrap();

        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 2);
        assert_eq!(comments.len(), 2);
    }

    #[tokio::test]
    async fn a_download_follows_the_redirect_to_the_stored_file() {
        let router = axum::Router::new()
            .route(
                "/api/projects/WEB/issues/1/attachments/3",
                axum::routing::get(|| async {
                    axum::response::Redirect::to("/bucket/object?signature=x")
                }),
            )
            .route(
                "/bucket/object",
                axum::routing::get(|| async { "the bytes" }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async { axum::serve(listener, router).await });
        let client = Client::new(&format!("http://{address}"), None).unwrap();

        let response = client.download(&"WEB-1".parse().unwrap(), 3).await.unwrap();

        assert_eq!(response.bytes().await.unwrap(), "the bytes");
    }

    /// Accepts connections; the first `drops` read the request and close without answering
    /// (a server going away mid-redeploy), the rest answer `{}`.
    async fn flaky_server(
        drops: usize,
    ) -> (String, std::sync::Arc<std::sync::atomic::AtomicUsize>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let accepted = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter = accepted.clone();
        tokio::spawn(async move {
            loop {
                let (mut stream, _) = listener.accept().await.unwrap();
                let seen = counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let mut buffer = [0; 4096];
                let _ = stream.read(&mut buffer).await;
                if seen >= drops {
                    let answer = "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 2\r\nconnection: close\r\n\r\n{}";
                    let _ = stream.write_all(answer.as_bytes()).await;
                }
            }
        });
        (format!("http://{address}"), accepted)
    }

    #[tokio::test]
    async fn a_read_is_retried_once_after_the_server_drops_the_connection() {
        let (url, accepted) = flaky_server(1).await;
        let client = Client::new(&url, None).unwrap();

        let answer: Value = client
            .send(client.request(Method::GET, &["me"]))
            .await
            .unwrap();

        assert_eq!(answer, serde_json::json!({}));
        assert_eq!(accepted.load(std::sync::atomic::Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn a_write_that_reached_the_server_is_not_sent_twice() {
        let (url, accepted) = flaky_server(1).await;
        let client = Client::new(&url, None).unwrap();

        let error = client
            .send::<Value>(client.request(Method::POST, &["projects", "WEB", "archive"]))
            .await
            .unwrap_err();

        assert!(matches!(error, Error::Network(_)), "{error}");
        assert_eq!(accepted.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn a_server_that_never_answers_fails_instead_of_hanging() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut open = vec![];
            loop {
                open.push(listener.accept().await.unwrap());
            }
        });
        let client = Client::with_read_timeout(
            &format!("http://{address}"),
            None,
            Duration::from_millis(200),
        )
        .unwrap();

        let sent = tokio::time::timeout(
            Duration::from_secs(5),
            client.send::<Value>(client.request(Method::GET, &["me"])),
        )
        .await
        .expect("a silent server must time out");

        assert!(matches!(sent, Err(Error::Network(_))));
    }
}
