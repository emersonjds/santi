use std::fmt;
use std::str::FromStr;

use reqwest::{Method, RequestBuilder, Url};
use santi_types::auth::User;
use santi_types::boards::{Backlog, BoardSettings, BoardView};
use santi_types::imports::{ImportMapping, ImportPreview, ImportResult};
use santi_types::issues::{
    Comment, CreateComment, CreateIssue, Issue, IssueFilter, MoveIssue, Page, PageParams,
    StatusFilter, UpdateIssue,
};
use santi_types::projects::Project;
use santi_types::sprints::{CompleteSprint, CreateSprint, Sprint, StartSprint};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::error::{Error, problem_from};

/// The one typed client of the JSON API; the CLI and the MCP server both go through it.
#[derive(Clone)]
pub struct Client {
    http: reqwest::Client,
    base: Url,
    token: Option<String>,
}

impl Client {
    pub fn new(url: &str, token: Option<String>) -> Result<Client, Error> {
        let base = Url::parse(url)
            .map_err(|error| Error::Usage(format!("`{url}` is not a server URL: {error}")))?;
        let http = reqwest::Client::builder()
            .user_agent(concat!("santi-cli/", env!("CARGO_PKG_VERSION")))
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

    pub async fn projects(&self) -> Result<Vec<Project>, Error> {
        self.send(self.request(Method::GET, &["projects"])).await
    }

    pub async fn board(&self, project: &ProjectKey) -> Result<BoardView, Error> {
        let request = self.request(Method::GET, &["projects", project.as_str(), "board"]);
        self.send(request).await
    }

    pub async fn backlog(&self, project: &ProjectKey) -> Result<Backlog, Error> {
        let request = self.request(Method::GET, &["projects", project.as_str(), "backlog"]);
        self.send(request).await
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
        self.send(self.issue_request(Method::GET, key, None)).await
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
        let request = self.issue_request(Method::PATCH, key, None);
        self.send(request.json(changes)).await
    }

    pub async fn move_issue(&self, key: &IssueKey, change: &MoveIssue) -> Result<Issue, Error> {
        let request = self.issue_request(Method::POST, key, Some("move"));
        self.send(request.json(change)).await
    }

    pub async fn delete_issue(&self, key: &IssueKey) -> Result<(), Error> {
        self.send(self.issue_request(Method::DELETE, key, None))
            .await
    }

    pub async fn comment(&self, key: &IssueKey, body: &str) -> Result<Comment, Error> {
        let request = self.issue_request(Method::POST, key, Some("comments"));
        let body = CreateComment { body: body.into() };
        self.send(request.json(&body)).await
    }

    pub async fn comments(
        &self,
        key: &IssueKey,
        page: &PageParams,
    ) -> Result<Page<Comment>, Error> {
        let request = self.issue_request(Method::GET, key, Some("comments"));
        self.send(request.query(&to_query(page))).await
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
                Some(cursor) => page.cursor = Some(cursor),
                None => return Ok(comments),
            }
        }
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

    fn issue_request(
        &self,
        method: Method,
        key: &IssueKey,
        action: Option<&str>,
    ) -> RequestBuilder {
        let number = key.number.to_string();
        let mut path = vec!["projects", key.project.as_str(), "issues", &number];
        path.extend(action);
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

    async fn send<T: DeserializeOwned>(&self, request: RequestBuilder) -> Result<T, Error> {
        let network = |error: reqwest::Error| {
            Error::Network(format!(
                "cannot reach santi at {}: {error}",
                self.shown_url()
            ))
        };
        let response = request.send().await.map_err(network)?;
        let status = response.status();
        let body = response.bytes().await.map_err(network)?;
        if !status.is_success() {
            return Err(Error::Api(problem_from(status.as_u16(), &body)));
        }
        let body = if body.is_empty() { &b"null"[..] } else { &body };
        serde_json::from_slice(body).map_err(|error| {
            let url = self.shown_url();
            Error::Other(format!("unexpected answer from {url}: {error}"))
        })
    }
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
}
