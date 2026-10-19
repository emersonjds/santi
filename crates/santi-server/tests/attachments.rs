mod common;

use std::path::{Path, PathBuf};

use axum::body::{Body, Bytes};
use axum::http::{Method, Request, StatusCode, header};
use axum::response::Response;
use common::{TestApp, body_json};
use http_body_util::BodyExt;
use santi_server::AppState;
use santi_server::storage::{S3Config, Storage, StorageConfig};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

const BOUNDARY: &str = "santi-attachment-boundary";
const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\x01";
const PDF: &[u8] = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
const FILES: &str = "/api/projects/SANTI/issues/1/attachments";

fn png(name: &str) -> (String, Vec<u8>) {
    (name.into(), PNG.to_vec())
}

fn multipart(files: &[(String, Vec<u8>)], comment_id: Option<i64>) -> Vec<u8> {
    let mut body = Vec::new();
    if let Some(comment_id) = comment_id {
        body.extend_from_slice(
            format!("--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"comment_id\"\r\n\r\n{comment_id}\r\n").as_bytes(),
        );
    }
    for (name, bytes) in files {
        body.extend_from_slice(
            format!("--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: application/octet-stream\r\n\r\n").as_bytes(),
        );
        body.extend_from_slice(bytes);
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{BOUNDARY}--\r\n").as_bytes());
    body
}

fn upload_request(app: &TestApp, uri: &str, body: Body) -> Request<Body> {
    Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header(
            header::AUTHORIZATION,
            format!("Bearer {}", app.token.as_deref().unwrap()),
        )
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={BOUNDARY}"),
        )
        .body(body)
        .unwrap()
}

async fn post_body(app: &TestApp, uri: &str, body: Body) -> (StatusCode, Value) {
    let response = app.send(upload_request(app, uri, body)).await;
    let status = response.status();
    (status, body_json(response).await)
}

async fn upload_to(
    app: &TestApp,
    uri: &str,
    files: &[(String, Vec<u8>)],
    comment_id: Option<i64>,
) -> (StatusCode, Value) {
    post_body(app, uri, Body::from(multipart(files, comment_id))).await
}

fn text_part(name: &str, value: &str) -> Vec<u8> {
    format!("--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n")
        .into_bytes()
}

async fn upload(app: &TestApp, files: &[(String, Vec<u8>)]) -> (StatusCode, Value) {
    upload_to(app, FILES, files, None).await
}

async fn get_raw(app: &TestApp, uri: &str) -> Response {
    let request = Request::builder()
        .uri(uri)
        .header(
            header::AUTHORIZATION,
            format!("Bearer {}", app.token.as_deref().unwrap()),
        )
        .body(Body::empty())
        .unwrap();
    app.send(request).await
}

async fn download(app: &TestApp, id: &Value) -> Response {
    get_raw(app, &format!("{FILES}/{id}")).await
}

async fn bytes(response: Response) -> Vec<u8> {
    response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes()
        .to_vec()
}

async fn list(app: &TestApp) -> Vec<Value> {
    let (status, files) = app.get(FILES).await;
    assert_eq!(status, StatusCode::OK, "{files}");
    files.as_array().unwrap().clone()
}

/// Ana administers SANTI with issue SANTI-1; Bob is a plain member; Carl is outside.
async fn team(pool: PgPool, storage: Storage) -> (TestApp, TestApp, TestApp) {
    let state = AppState {
        storage,
        ..AppState::new(pool)
    };
    let anonymous = TestApp {
        router: santi_server::app(state, None),
        token: None,
        user_id: 0,
    };
    let ana = anonymous.another_user("ana@example.com").await;
    ana.create_project("SANTI", "kanban").await;
    let bob = ana.another_user("bob@example.com").await;
    let (status, _) = ana
        .post(
            "/api/projects/SANTI/members",
            json!({ "email": "bob@example.com", "role": "member" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    let carl = ana.another_user("carl@example.com").await;
    carl.create_project("CARL", "kanban").await;
    ana.create_issue("SANTI", json!({ "summary": "Needs files" }))
        .await;
    (ana, bob, carl)
}

fn disk(name: &str) -> (Storage, PathBuf) {
    let dir = std::env::temp_dir().join(format!("santi-attachments-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let storage = Storage::new(&StorageConfig::Local(dir.clone())).unwrap();
    (storage, dir)
}

fn stored_files(dir: &Path) -> usize {
    std::fs::read_dir(dir)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .map(|path| match path.is_dir() {
            true => stored_files(&path),
            false => 1,
        })
        .sum()
}

#[sqlx::test]
async fn an_image_and_a_pdf_upload_list_and_download(pool: PgPool) {
    let (ana, _, _) = team(pool, Storage::memory()).await;

    let (status, created) = upload(
        &ana,
        &[
            png("../screens/Tela inicial.png"),
            ("Relatório.pdf".into(), PDF.to_vec()),
        ],
    )
    .await;

    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert_eq!(created[0]["file_name"], "Tela inicial.png");
    assert_eq!(created[0]["content_type"], "image/png");
    assert_eq!(created[0]["size_bytes"], PNG.len());
    assert_eq!(created[0]["uploader_id"], ana.user_id);
    assert_eq!(created[0]["uploader_name"], "ana@example.com");
    assert!(created[0]["comment_id"].is_null());
    assert_eq!(created[1]["content_type"], "application/pdf");
    let files = list(&ana).await;
    assert_eq!(files.len(), 2);
    assert_eq!(files[1]["file_name"], "Relatório.pdf");

    let image = download(&ana, &created[0]["id"]).await;
    assert_eq!(image.status(), StatusCode::OK);
    let headers = image.headers().clone();
    assert_eq!(headers[header::CONTENT_TYPE], "image/png");
    assert_eq!(
        headers[header::CONTENT_DISPOSITION],
        "inline; filename=\"Tela inicial.png\"; filename*=UTF-8''Tela%20inicial.png"
    );
    assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
    assert_eq!(headers[header::CONTENT_SECURITY_POLICY], "sandbox");
    assert_eq!(bytes(image).await, PNG);
    let pdf = download(&ana, &created[1]["id"]).await;
    assert_eq!(
        pdf.headers()[header::CONTENT_DISPOSITION],
        "attachment; filename=\"Relat_rio.pdf\"; filename*=UTF-8''Relat%C3%B3rio.pdf"
    );
    assert_eq!(bytes(pdf).await, PDF);
}

#[sqlx::test]
async fn with_s3_a_download_redirects_to_a_presigned_url(pool: PgPool) {
    let storage = Storage::new(&StorageConfig::S3(S3Config {
        bucket: "santi-files".into(),
        endpoint: "https://storage.example.test".into(),
        region: "auto".into(),
        access_key_id: "key-id".into(),
        secret_access_key: "secret".into(),
    }))
    .unwrap();
    let (ana, _, _) = team(pool.clone(), storage).await;
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO attachment (issue_id, uploader_id, file_name, content_type, size_bytes, storage_key)
         SELECT id, $1, 'report.pdf', 'application/pdf', 3, '9/9/abc' FROM issue WHERE number = 1
         RETURNING id",
    )
    .bind(ana.user_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let response = download(&ana, &json!(id)).await;

    assert_eq!(response.status(), StatusCode::FOUND);
    let location = response.headers()[header::LOCATION].to_str().unwrap();
    assert!(
        location.starts_with("https://storage.example.test/santi-files/9/9/abc?"),
        "{location}"
    );
    assert!(
        location
            .contains("response-content-disposition=attachment%3B%20filename%3D%22report.pdf%22"),
        "{location}"
    );
    assert!(
        location.contains("response-content-type=application%2Fpdf"),
        "{location}"
    );
}

#[sqlx::test]
async fn refused_files_leave_nothing_behind(pool: PgPool) {
    let (storage, dir) = disk("refused");
    let (ana, _, _) = team(pool, storage).await;
    let mut huge = PNG.to_vec();
    huge.resize(25 * 1024 * 1024 + 1, 0);

    let (too_big, big_problem) = upload(&ana, &[png("ok.png"), ("huge.png".into(), huge)]).await;
    let (svg, svg_problem) = upload(
        &ana,
        &[
            png("ok.png"),
            (
                "logo.svg".into(),
                b"<svg xmlns='http://www.w3.org/2000/svg'/>".to_vec(),
            ),
        ],
    )
    .await;
    let (html, html_problem) = upload(
        &ana,
        &[(
            "cat.png".into(),
            b"<!doctype html><script>alert(1)</script>".to_vec(),
        )],
    )
    .await;
    let (none, _) = upload(&ana, &[]).await;

    assert_eq!(too_big, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(big_problem["errors"][0]["message"], "Larger than 25 MB.");
    assert_eq!(svg, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        svg_problem["errors"][0]["message"],
        "This file type is not allowed."
    );
    assert_eq!(html, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        html_problem["errors"][0]["message"],
        "This file type is not allowed."
    );
    assert_eq!(none, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(list(&ana).await.is_empty());
    assert_eq!(stored_files(&dir), 0);
    std::fs::remove_dir_all(dir).unwrap();
}

#[sqlx::test]
async fn an_issue_holds_100_files_and_a_request_10(pool: PgPool) {
    let (storage, dir) = disk("counts");
    let (ana, _, _) = team(pool, storage).await;
    let ten: Vec<_> = (0..10).map(|n| png(&format!("{n}.png"))).collect();
    let eleven: Vec<_> = (0..11).map(|n| png(&format!("{n}.png"))).collect();

    let (over_request, problem) = upload(&ana, &eleven).await;
    for _ in 0..10 {
        assert_eq!(upload(&ana, &ten).await.0, StatusCode::CREATED);
    }
    let (over_issue, full) = upload(&ana, &[png("101.png")]).await;

    assert_eq!(over_request, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        problem["errors"][0]["message"],
        "At most 10 files per upload."
    );
    assert_eq!(over_issue, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        full["errors"][0]["message"],
        "An issue holds at most 100 files."
    );
    assert_eq!(list(&ana).await.len(), 100);
    assert_eq!(stored_files(&dir), 100);
    std::fs::remove_dir_all(dir).unwrap();
}

#[sqlx::test]
async fn strangers_get_404_and_only_the_uploader_or_an_admin_deletes(pool: PgPool) {
    let (storage, dir) = disk("delete");
    let (ana, bob, carl) = team(pool, storage).await;
    let (_, by_ana) = upload(&ana, &[png("ana.png")]).await;
    let (_, by_bob) = upload(&bob, &[png("bob.png"), png("bob2.png")]).await;
    let ana_file = &by_ana[0]["id"];

    let (stranger_list, _) = carl.get(FILES).await;
    let (stranger_upload, _) = upload(&carl, &[png("x.png")]).await;
    let stranger_download = download(&carl, ana_file).await.status();
    let (stranger_delete, _) = carl.delete(&format!("{FILES}/{ana_file}")).await;
    let (member_delete, _) = bob.delete(&format!("{FILES}/{ana_file}")).await;
    let (own_delete, _) = bob.delete(&format!("{FILES}/{}", by_bob[0]["id"])).await;
    let (admin_delete, _) = ana.delete(&format!("{FILES}/{}", by_bob[1]["id"])).await;
    let (again, _) = ana.delete(&format!("{FILES}/{}", by_bob[1]["id"])).await;

    assert_eq!(stranger_list, StatusCode::NOT_FOUND);
    assert_eq!(stranger_upload, StatusCode::NOT_FOUND);
    assert_eq!(stranger_download, StatusCode::NOT_FOUND);
    assert_eq!(stranger_delete, StatusCode::NOT_FOUND);
    assert_eq!(member_delete, StatusCode::FORBIDDEN);
    assert_eq!(own_delete, StatusCode::NO_CONTENT);
    assert_eq!(admin_delete, StatusCode::NO_CONTENT);
    assert_eq!(again, StatusCode::NOT_FOUND);
    assert_eq!(
        download(&ana, &by_bob[0]["id"]).await.status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(list(&ana).await.len(), 1);
    assert_eq!(stored_files(&dir), 1);
    std::fs::remove_dir_all(dir).unwrap();
}

#[sqlx::test]
async fn archived_projects_list_and_download_but_take_no_writes(pool: PgPool) {
    let (ana, _, _) = team(pool, Storage::memory()).await;
    let (_, created) = upload(&ana, &[png("shot.png")]).await;
    let id = &created[0]["id"];
    ana.post("/api/projects/SANTI/archive", json!(null)).await;

    let (upload_status, problem) = upload(&ana, &[png("late.png")]).await;
    let (delete_status, _) = ana.delete(&format!("{FILES}/{id}")).await;

    assert_eq!(upload_status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:project-archived");
    assert_eq!(delete_status, StatusCode::CONFLICT);
    assert_eq!(list(&ana).await.len(), 1);
    assert_eq!(download(&ana, id).await.status(), StatusCode::OK);
}

#[sqlx::test]
async fn a_trashed_project_hides_its_files_and_purges_them(pool: PgPool) {
    let (storage, dir) = disk("purge");
    let (ana, _, _) = team(pool, storage).await;
    let (_, created) = upload(&ana, &[png("shot.png")]).await;
    ana.post("/api/projects/SANTI/trash", json!(null)).await;

    let (listed, _) = ana.get(FILES).await;
    let downloaded = download(&ana, &created[0]["id"]).await.status();
    let (purged, _) = ana.delete("/api/projects/SANTI").await;

    assert_eq!(listed, StatusCode::NOT_FOUND);
    assert_eq!(downloaded, StatusCode::NOT_FOUND);
    assert_eq!(purged, StatusCode::NO_CONTENT);
    assert_eq!(stored_files(&dir), 0);
    std::fs::remove_dir_all(dir).unwrap();
}

#[sqlx::test]
async fn the_hourly_purge_removes_stored_files(pool: PgPool) {
    let (storage, dir) = disk("hourly");
    let (ana, _, _) = team(pool.clone(), storage.clone()).await;
    upload(&ana, &[png("shot.png")]).await;
    ana.post("/api/projects/SANTI/trash", json!(null)).await;
    sqlx::query("UPDATE project SET trashed_at = now() - interval '61 days' WHERE key = 'SANTI'")
        .execute(&pool)
        .await
        .unwrap();

    let purged = santi_server::purge_trash(&pool, &storage).await.unwrap();

    assert_eq!(purged, 1);
    assert_eq!(stored_files(&dir), 0);
    std::fs::remove_dir_all(dir).unwrap();
}

#[sqlx::test]
async fn comment_files_belong_to_a_comment_of_the_same_issue(pool: PgPool) {
    let (storage, dir) = disk("comments");
    let (ana, _, _) = team(pool, storage).await;
    ana.create_issue("SANTI", json!({ "summary": "Other" }))
        .await;
    let (_, here) = ana
        .post(
            "/api/projects/SANTI/issues/1/comments",
            json!({ "body": "See the screenshot" }),
        )
        .await;
    let (_, there) = ana
        .post(
            "/api/projects/SANTI/issues/2/comments",
            json!({ "body": "Elsewhere" }),
        )
        .await;

    let (wrong, problem) = upload_to(&ana, FILES, &[png("x.png")], there["id"].as_i64()).await;
    let (status, created) = upload_to(&ana, FILES, &[png("shot.png")], here["id"].as_i64()).await;
    upload(&ana, &[png("issue.png")]).await;

    assert_eq!(wrong, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "comment_id");
    assert_eq!(status, StatusCode::CREATED, "{created}");
    assert_eq!(created[0]["comment_id"], here["id"]);
    assert_eq!(stored_files(&dir), 2);

    let (deleted, _) = ana
        .delete(&format!(
            "/api/projects/SANTI/issues/1/comments/{}",
            here["id"]
        ))
        .await;

    assert_eq!(deleted, StatusCode::NO_CONTENT);
    let files = list(&ana).await;
    assert_eq!(files.len(), 1);
    assert_eq!(files[0]["file_name"], "issue.png");
    assert_eq!(stored_files(&dir), 1);
    std::fs::remove_dir_all(dir).unwrap();
}

#[sqlx::test]
async fn deleting_an_issue_removes_its_files(pool: PgPool) {
    let (storage, dir) = disk("issue-delete");
    let (ana, _, _) = team(pool, storage).await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Child", "issue_type": "subtask", "parent": "SANTI-1" }),
    )
    .await;
    upload(&ana, &[png("parent.png")]).await;
    upload_to(
        &ana,
        "/api/projects/SANTI/issues/2/attachments",
        &[png("child.png")],
        None,
    )
    .await;

    let (deleted, _) = ana.delete("/api/projects/SANTI/issues/1").await;

    assert_eq!(deleted, StatusCode::NO_CONTENT);
    assert_eq!(stored_files(&dir), 0);
    std::fs::remove_dir_all(dir).unwrap();
}

#[sqlx::test]
async fn uploads_are_rate_limited_per_account(pool: PgPool) {
    let (ana, bob, _) = team(pool, Storage::memory()).await;

    let mut statuses = Vec::new();
    for _ in 0..31 {
        statuses.push(upload(&ana, &[]).await.0);
    }
    let (other, _) = upload(&bob, &[]).await;

    assert!(
        statuses[..30]
            .iter()
            .all(|status| *status == StatusCode::UNPROCESSABLE_ENTITY)
    );
    assert_eq!(statuses[30], StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(other, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn erasing_an_account_removes_the_files_of_its_solo_projects(pool: PgPool) {
    let (storage, dir) = disk("erase");
    let (ana, bob, carl) = team(pool, storage).await;
    upload(&bob, &[png("shared.png")]).await;
    carl.create_issue("CARL", json!({ "summary": "Mine" }))
        .await;
    upload_to(
        &carl,
        "/api/projects/CARL/issues/1/attachments",
        &[png("solo.png")],
        None,
    )
    .await;
    let erase = |app: &TestApp| {
        common::json_request(
            Method::DELETE,
            "/api/me",
            app.token.as_deref(),
            Some(json!({ "password": common::PASSWORD })),
        )
    };

    let carl_gone = carl.send(erase(&carl)).await.status();
    let bob_gone = bob.send(erase(&bob)).await.status();

    assert_eq!(carl_gone, StatusCode::NO_CONTENT);
    assert_eq!(bob_gone, StatusCode::NO_CONTENT);
    assert_eq!(list(&ana).await.len(), 1);
    assert_eq!(stored_files(&dir), 1);
    std::fs::remove_dir_all(dir).unwrap();
}

#[sqlx::test]
async fn a_file_answers_only_under_its_own_issue_and_project(pool: PgPool) {
    let (ana, _, carl) = team(pool, Storage::memory()).await;
    ana.create_issue("SANTI", json!({ "summary": "Other" }))
        .await;
    carl.create_issue("CARL", json!({ "summary": "Mine" }))
        .await;
    let (_, created) = upload_to(
        &ana,
        "/api/projects/SANTI/issues/2/attachments",
        &[png("two.png")],
        None,
    )
    .await;
    let id = &created[0]["id"];
    let carl_uri = format!("/api/projects/CARL/issues/1/attachments/{id}");

    let other_issue = download(&ana, id).await.status();
    let (other_issue_delete, _) = ana.delete(&format!("{FILES}/{id}")).await;
    let other_project = get_raw(&carl, &carl_uri).await.status();
    let (other_project_delete, _) = carl.delete(&carl_uri).await;

    assert_eq!(other_issue, StatusCode::NOT_FOUND);
    assert_eq!(other_issue_delete, StatusCode::NOT_FOUND);
    assert_eq!(other_project, StatusCode::NOT_FOUND);
    assert_eq!(other_project_delete, StatusCode::NOT_FOUND);
    let own = get_raw(
        &ana,
        &format!("/api/projects/SANTI/issues/2/attachments/{id}"),
    )
    .await;
    assert_eq!(own.status(), StatusCode::OK);
}

#[sqlx::test]
async fn comment_id_must_be_a_short_number(pool: PgPool) {
    let (storage, dir) = disk("comment-id");
    let (ana, _, _) = team(pool, storage).await;
    let (_, comment) = ana
        .post(
            "/api/projects/SANTI/issues/1/comments",
            json!({ "body": "Files below" }),
        )
        .await;
    let padded = format!("{:0>21}", comment["id"].as_i64().unwrap());
    let with = |value: &str| {
        Body::from(
            [
                text_part("comment_id", value),
                multipart(&[png("a.png")], None),
            ]
            .concat(),
        )
    };

    let (word, word_problem) = post_body(&ana, FILES, with("seven")).await;
    let (long, long_problem) = post_body(&ana, FILES, with(&padded)).await;
    let (huge, _) = post_body(&ana, FILES, with(&"9".repeat(64 * 1024))).await;

    assert_eq!(word, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(word_problem["errors"][0]["field"], "comment_id");
    assert_eq!(long, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(long_problem["errors"][0]["field"], "comment_id");
    assert_eq!(huge, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(list(&ana).await.is_empty());
    assert_eq!(stored_files(&dir), 0);
    std::fs::remove_dir_all(dir).unwrap();
}

#[sqlx::test]
async fn broken_multipart_is_422(pool: PgPool) {
    let (ana, _, _) = team(pool, Storage::memory()).await;
    let mut unfinished = multipart(&[png("a.png")], None);
    unfinished.truncate(unfinished.len() - BOUNDARY.len() - 6);
    let no_boundary = Request::builder()
        .method(Method::POST)
        .uri(FILES)
        .header(
            header::AUTHORIZATION,
            format!("Bearer {}", ana.token.as_deref().unwrap()),
        )
        .header(header::CONTENT_TYPE, "multipart/form-data")
        .body(Body::from(multipart(&[png("a.png")], None)))
        .unwrap();

    let (cut, problem) = post_body(&ana, FILES, Body::from(unfinished)).await;
    let rejected = ana.send(no_boundary).await.status();

    assert_eq!(cut, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "file");
    assert_eq!(rejected, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(list(&ana).await.is_empty());
}

static MEGABYTE: [u8; 1024 * 1024] = [b'a'; 1024 * 1024];

#[sqlx::test]
async fn a_body_over_the_limit_is_413(pool: PgPool) {
    let (ana, _, _) = team(pool, Storage::memory()).await;
    let head = Bytes::from(format!(
        "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"padding\"\r\n\r\n"
    ));
    let padding = std::iter::repeat_n(Bytes::from_static(&MEGABYTE), 252);
    let body = futures_util::stream::iter(
        std::iter::once(head)
            .chain(padding)
            .map(Ok::<_, std::io::Error>),
    );

    let (status, problem) = post_body(&ana, FILES, Body::from_stream(body)).await;

    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE, "{problem}");
    assert_eq!(problem["status"], 413);
}

#[sqlx::test]
async fn files_cut_short_are_stored_then_refused(pool: PgPool) {
    let (storage, dir) = disk("cut-short");
    let (ana, _, _) = team(pool, storage).await;

    let (short_png, png_problem) = upload(&ana, &[("tiny.png".into(), PNG[..6].to_vec())]).await;
    let (cut_text, text_problem) =
        upload(&ana, &[("cut.txt".into(), "ação".as_bytes()[..2].to_vec())]).await;

    assert_eq!(short_png, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        png_problem["errors"][0]["message"],
        "This file type is not allowed."
    );
    assert_eq!(cut_text, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        text_problem["errors"][0]["message"],
        "Text files must be UTF-8."
    );
    assert!(list(&ana).await.is_empty());
    assert_eq!(stored_files(&dir), 0);
    std::fs::remove_dir_all(dir).unwrap();
}

#[sqlx::test]
async fn a_storage_failure_keeps_nothing(pool: PgPool) {
    let (storage, dir) = disk("broken");
    let (ana, _, _) = team(pool, storage).await;
    std::fs::remove_dir_all(&dir).unwrap();
    std::fs::write(&dir, b"not a directory").unwrap();

    let (status, _) = upload(&ana, &[png("a.png")]).await;

    std::fs::remove_file(&dir).unwrap();
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert!(list(&ana).await.is_empty());
}

/// Holds the upload's closing boundary until `change` ran, so it lands after the request passed
/// its membership check.
async fn upload_while(
    pool: PgPool,
    name: &str,
    change: &'static str,
) -> (StatusCode, Value, usize, i64) {
    let (storage, dir) = disk(name);
    let (ana, _, _) = team(pool.clone(), storage).await;
    let (sender, receiver) = tokio::sync::mpsc::channel::<Result<Bytes, std::io::Error>>(1);
    let body = futures_util::stream::unfold(receiver, |mut receiver| async move {
        receiver.recv().await.map(|chunk| (chunk, receiver))
    });
    let request = upload_request(&ana, FILES, Body::from_stream(body));
    let router = ana.router.clone();
    let response = tokio::spawn(async move { router.oneshot(request).await.unwrap() });
    let parts = multipart(&[png("a.png")], None);
    let (file, closing) = parts.split_at(parts.len() - BOUNDARY.len() - 6);

    sender.send(Ok(Bytes::copy_from_slice(file))).await.unwrap();
    sender.send(Ok(Bytes::new())).await.unwrap();
    sqlx::query(change).execute(&pool).await.unwrap();
    sender
        .send(Ok(Bytes::copy_from_slice(closing)))
        .await
        .unwrap();
    drop(sender);

    let response = response.await.unwrap();
    let status = response.status();
    let problem = body_json(response).await;
    let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM attachment")
        .fetch_one(&pool)
        .await
        .unwrap();
    let stored = stored_files(&dir);
    std::fs::remove_dir_all(dir).unwrap();
    (status, problem, stored, rows)
}

#[sqlx::test]
async fn archiving_during_an_upload_keeps_nothing(pool: PgPool) {
    let (status, problem, stored, rows) = upload_while(
        pool,
        "archive-race",
        "UPDATE project SET archived_at = now() WHERE key = 'SANTI'",
    )
    .await;

    assert_eq!(status, StatusCode::CONFLICT, "{problem}");
    assert_eq!(problem["type"], "urn:santi:error:project-archived");
    assert_eq!((stored, rows), (0, 0));
}

#[sqlx::test]
async fn trashing_during_an_upload_keeps_nothing(pool: PgPool) {
    let (status, problem, stored, rows) = upload_while(
        pool,
        "trash-race",
        "UPDATE project SET trashed_at = now() WHERE key = 'SANTI'",
    )
    .await;

    assert_eq!(status, StatusCode::NOT_FOUND, "{problem}");
    assert_eq!((stored, rows), (0, 0));
}

#[sqlx::test]
async fn only_the_comment_author_or_an_admin_attaches_to_a_comment(pool: PgPool) {
    let (storage, dir) = disk("comment-author");
    let (ana, bob, _) = team(pool, storage).await;
    let comments = "/api/projects/SANTI/issues/1/comments";
    let (_, by_ana) = ana.post(comments, json!({ "body": "Ana's" })).await;
    let (_, by_bob) = bob.post(comments, json!({ "body": "Bob's" })).await;

    let (other, _) = upload_to(&bob, FILES, &[png("x.png")], by_ana["id"].as_i64()).await;
    let (own, _) = upload_to(&bob, FILES, &[png("own.png")], by_bob["id"].as_i64()).await;
    let (admin, _) = upload_to(&ana, FILES, &[png("admin.png")], by_bob["id"].as_i64()).await;

    assert_eq!(other, StatusCode::FORBIDDEN);
    assert_eq!(own, StatusCode::CREATED);
    assert_eq!(admin, StatusCode::CREATED);
    assert_eq!(list(&ana).await.len(), 2);
    assert_eq!(stored_files(&dir), 2);
    std::fs::remove_dir_all(dir).unwrap();
}

#[sqlx::test]
async fn local_downloads_carry_their_length_uncompressed(pool: PgPool) {
    let (ana, _, _) = team(pool, Storage::memory()).await;
    let text = "santi ".repeat(100);
    let (_, created) = upload(&ana, &[("notes.txt".into(), text.clone().into_bytes())]).await;
    let request = Request::builder()
        .uri(format!("{FILES}/{}", created[0]["id"]))
        .header(
            header::AUTHORIZATION,
            format!("Bearer {}", ana.token.as_deref().unwrap()),
        )
        .header(header::ACCEPT_ENCODING, "gzip, br")
        .body(Body::empty())
        .unwrap();

    let response = ana.send(request).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()[header::CONTENT_LENGTH], "600");
    assert!(!response.headers().contains_key(header::CONTENT_ENCODING));
    assert_eq!(bytes(response).await, text.as_bytes());
}
