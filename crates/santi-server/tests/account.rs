mod common;

use axum::http::{Method, StatusCode, header};
use common::{PASSWORD, TestApp, body_json, json_request};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn delete_account(app: &TestApp, password: &str) -> (StatusCode, Value, Option<String>) {
    let request = json_request(
        Method::DELETE,
        "/api/me",
        app.token.as_deref(),
        Some(json!({ "password": password })),
    );
    let response = app.send(request).await;
    let status = response.status();
    let cookie = response
        .headers()
        .get(header::SET_COOKIE)
        .map(|value| value.to_str().unwrap().to_string());
    (status, body_json(response).await, cookie)
}

async fn join(admin: &TestApp, key: &str, email: &str, role: &str) {
    let body = json!({ "email": email, "role": role });
    let (status, member) = admin
        .post(&format!("/api/projects/{key}/members"), body)
        .await;
    assert_eq!(status, StatusCode::CREATED, "{member}");
}

#[sqlx::test]
async fn the_export_holds_the_account_and_every_project_it_admins(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.create_sprint("SANTI").await;
    ana.create_issue("SANTI", json!({ "summary": "Ship it" }))
        .await;
    let (_, comment) = ana
        .post(
            "/api/projects/SANTI/issues/1/comments",
            json!({ "body": "On i" }),
        )
        .await;
    ana.patch(
        &format!("/api/projects/SANTI/issues/1/comments/{}", comment["id"]),
        json!({ "body": "On it" }),
    )
    .await;
    bob.create_project("BOB", "kanban").await;
    bob.create_issue("BOB", json!({ "summary": "Bob's secret plan" }))
        .await;
    join(&bob, "BOB", "ana@example.com", "member").await;

    let response = ana
        .send(json_request(
            Method::GET,
            "/api/me/export",
            ana.token.as_deref(),
            None,
        ))
        .await;

    assert_eq!(response.status(), StatusCode::OK);
    let export = body_json(response).await;
    let text = export.to_string();
    assert_eq!(export["user"]["email"], "ana@example.com");
    assert_eq!(export["api_tokens"][0]["name"], "tests");
    assert!(
        !text.contains("password") && !text.contains("$argon2") && !text.contains("token_hash")
    );
    let santi = &export["projects"][0];
    assert_eq!(santi["project"]["key"], "SANTI");
    assert_eq!(santi["members"][0]["email"], "ana@example.com");
    assert_eq!(santi["board"]["columns"].as_array().unwrap().len(), 3);
    assert_eq!(santi["sprints"].as_array().unwrap().len(), 1);
    assert_eq!(santi["issues"][0]["summary"], "Ship it");
    assert_eq!(santi["comments"][0]["issue_key"], "SANTI-1");
    assert_eq!(santi["comments"][0]["body"], "On it");
    assert!(santi["comments"][0]["edited_at"].is_string());
    assert_eq!(santi["comments"][0]["edited_by_id"], ana.user_id);
    assert_eq!(export["projects"].as_array().unwrap().len(), 1);
    assert_eq!(export["other_projects"][0]["key"], "BOB");
    assert!(!text.contains("Bob's secret plan"));
}

#[sqlx::test]
async fn the_export_holds_the_home_stars_visits_and_history(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    bob.create_project("BOB", "kanban").await;
    bob.create_issue("BOB", json!({ "summary": "Bob's" })).await;
    join(&bob, "BOB", "ana@example.com", "member").await;
    let visit = ana
        .browser_post("ana@example.com", "/api/projects/BOB/visit")
        .await;
    let view = ana
        .browser_post("ana@example.com", "/api/projects/BOB/issues/1/view")
        .await;
    assert_eq!(
        (visit, view),
        (StatusCode::NO_CONTENT, StatusCode::NO_CONTENT)
    );
    for key in ["BOB", "BOB-1"] {
        let (status, _) = ana.post("/api/me/stars", json!({ "key": key })).await;
        assert_eq!(status, StatusCode::NO_CONTENT);
    }
    ana.create_issue("BOB", json!({ "summary": "Ana's" })).await;

    let (status, export) = ana.get("/api/me/export").await;

    assert_eq!(status, StatusCode::OK);
    let home = &export["home"];
    let project = &home["projects"][0];
    assert_eq!(project["key"], "BOB");
    assert!(project["starred_at"].is_string() && project["visited_at"].is_string());
    assert_eq!(home["projects"].as_array().unwrap().len(), 1);
    let issues = home["issues"].as_array().unwrap();
    assert_eq!(issues.len(), 2);
    let read = issues.iter().find(|issue| issue["key"] == "BOB-1").unwrap();
    assert!(read["starred_at"].is_string() && read["viewed_at"].is_string());
    assert!(read["worked_at"].is_null());
    let wrote = issues.iter().find(|issue| issue["key"] == "BOB-2").unwrap();
    assert!(wrote["worked_at"].is_string() && wrote["starred_at"].is_null());
    assert!(wrote["viewed_at"].is_null());
}

async fn join_with_a_link(admin: &TestApp, guest: &TestApp, key: &str) {
    let (_, invite) = admin
        .post(
            &format!("/api/projects/{key}/invites"),
            json!({ "role": "member", "max_uses": 2 }),
        )
        .await;
    let accept = format!("/api/invites/{}/accept", invite["token"].as_str().unwrap());
    assert_eq!(guest.post(&accept, json!(null)).await.0, StatusCode::OK);
}

#[sqlx::test]
async fn the_export_lists_the_invite_links_the_caller_joined_with(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    bob.create_project("BOB", "kanban").await;
    join_with_a_link(&bob, &ana, "BOB").await;

    let (status, export) = ana.get("/api/me/export").await;

    assert_eq!(status, StatusCode::OK);
    let uses = export["invite_uses"].as_array().unwrap();
    assert_eq!(uses.len(), 1, "{export}");
    assert_eq!(uses[0]["project_key"], "BOB");
    assert!(uses[0]["joined_at"].is_string());
}

#[sqlx::test]
async fn deleting_forgets_the_invite_links_the_account_joined_with(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    bob.create_project("BOB", "kanban").await;
    join_with_a_link(&bob, &ana, "BOB").await;

    let (status, _, _) = delete_account(&ana, PASSWORD).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    let uses: i64 = sqlx::query_scalar("SELECT count(*) FROM invite_use")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(uses, 0);
}

#[sqlx::test]
async fn export_and_delete_need_a_signed_in_caller(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (export, _) = app.get("/api/me/export").await;
    let (delete, _, _) = delete_account(&app, PASSWORD).await;
    let (_, api) = app.get("/openapi.json").await;

    assert_eq!(export, StatusCode::UNAUTHORIZED);
    assert_eq!(delete, StatusCode::UNAUTHORIZED);
    assert!(api["paths"]["/api/me/export"]["get"].is_object());
    assert!(api["paths"]["/api/me"]["delete"].is_object());
}

#[sqlx::test]
async fn deleting_needs_the_password_and_locks_after_repeated_misses(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, problem, _) = delete_account(&ana, "not the password").await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "password");
    assert_eq!(ana.get("/api/me").await.0, StatusCode::OK);
    for _ in 0..4 {
        delete_account(&ana, "not the password").await;
    }
    let (locked, _, _) = delete_account(&ana, PASSWORD).await;
    assert_eq!(locked, StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test]
async fn a_locked_login_does_not_block_deleting_the_account(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    for _ in 0..6 {
        let body = json!({ "email": "ana@example.com", "password": "wrong" });
        ana.post("/api/auth/login", body).await;
    }
    let body = json!({ "email": "ana@example.com", "password": PASSWORD });
    assert_eq!(
        ana.post("/api/auth/login", body).await.0,
        StatusCode::TOO_MANY_REQUESTS
    );

    let (status, _, _) = delete_account(&ana, PASSWORD).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
}

#[sqlx::test]
async fn deleting_signs_out_everywhere_and_frees_the_email(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;

    let (status, _, cookie) = delete_account(&ana, PASSWORD).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(cookie.unwrap().contains("Max-Age=0"));
    assert_eq!(ana.get("/api/me").await.0, StatusCode::UNAUTHORIZED);
    let again = ana.another_user("ana@example.com").await;
    let (_, projects) = again.get("/api/projects").await;
    assert_eq!(projects, json!([]));
}

#[sqlx::test]
async fn projects_outlive_the_account_only_when_others_use_them(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let carol = ana.another_user("carol@example.com").await;
    ana.create_project("SOLO", "scrum").await;
    ana.create_project("TEAM", "scrum").await;
    join(&ana, "TEAM", "bob@example.com", "member").await;
    join(&ana, "TEAM", "carol@example.com", "member").await;
    ana.create_project("DUO", "kanban").await;
    join(&ana, "DUO", "carol@example.com", "admin").await;
    join(&ana, "DUO", "bob@example.com", "member").await;
    let body = json!({ "summary": "Ana's task", "assignee_id": ana.user_id });
    ana.create_issue("TEAM", body).await;
    ana.post(
        "/api/projects/TEAM/issues/1/comments",
        json!({ "body": "Started" }),
    )
    .await;

    let (status, _, _) = delete_account(&ana, PASSWORD).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, team) = bob.get("/api/projects/TEAM").await;
    assert_eq!(
        team["role"], "admin",
        "the oldest remaining member steps up"
    );
    let (_, team_for_carol) = carol.get("/api/projects/TEAM").await;
    assert_eq!(team_for_carol["role"], "member");
    let (_, duo) = bob.get("/api/projects/DUO").await;
    assert_eq!(duo["role"], "member", "another admin was left");
    let (_, members) = bob.get("/api/projects/TEAM/members").await;
    assert_eq!(members.as_array().unwrap().len(), 2);
    let (_, issue) = bob.get("/api/projects/TEAM/issues/1").await;
    assert_eq!(issue["summary"], "Ana's task");
    assert_eq!(issue["assignee_id"], Value::Null);
    let (_, comments) = bob.get("/api/projects/TEAM/issues/1/comments").await;
    assert_eq!(comments["items"][0]["body"], "Started");
    let (_, board) = bob.get("/api/projects/TEAM/board").await;
    assert!(!board.to_string().contains("ana@example.com"));
    bob.create_project("SOLO", "scrum").await;
}

#[sqlx::test]
async fn the_address_an_erased_account_gets_cannot_be_squatted(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let squat = format!("deleted-{}@deleted.invalid", ana.user_id);
    let body = json!({ "email": squat, "password": PASSWORD, "display_name": "Squatter", "accept_terms": true, "confirm_age": true });

    let (refused, problem) = ana.post("/api/auth/register", body).await;
    sqlx::query(
        "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1, 'Old squat', 'x')",
    )
    .bind(&squat)
    .execute(&pool)
    .await
    .unwrap();
    let (deleted, _, _) = delete_account(&ana, PASSWORD).await;

    assert_eq!(refused, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(problem["errors"][0]["field"], "email");
    assert_eq!(deleted, StatusCode::NO_CONTENT);
    let erased: (String, bool) =
        sqlx::query_as("SELECT email, deleted_at IS NOT NULL FROM app_user WHERE id = $1")
            .bind(ana.user_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!erased.0.contains('@'), "{}", erased.0);
    assert!(erased.1);
}

#[sqlx::test]
async fn erased_accounts_are_never_found_added_or_heirs(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let carol = ana.another_user("carol@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    delete_account(&carol, PASSWORD).await;
    ana.create_project("TEAM", "scrum").await;
    ana.create_project("GHOST", "kanban").await;
    for email in [
        format!("deleted-{}@deleted.invalid", carol.user_id),
        format!("erased:{}", carol.user_id),
    ] {
        let body = json!({ "email": email, "role": "admin" });
        let (status, _) = ana.post("/api/projects/TEAM/members", body).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{email}");
    }
    join(&ana, "TEAM", "bob@example.com", "member").await;
    for key in ["TEAM", "GHOST"] {
        sqlx::query(
            "INSERT INTO member (project_id, user_id, role)
             SELECT id, $2, 'member' FROM project WHERE key = $1",
        )
        .bind(key)
        .bind(carol.user_id)
        .execute(&pool)
        .await
        .unwrap();
    }

    let (status, _, _) = delete_account(&ana, PASSWORD).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, team) = bob.get("/api/projects/TEAM").await;
    assert_eq!(team["role"], "admin", "a living member inherits");
    bob.create_project("GHOST", "scrum").await;
}

#[sqlx::test(migrations = false)]
async fn migration_0015_marks_accounts_erased_before_it(pool: PgPool) {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations");
    let mut files: Vec<_> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    files.sort();
    let run = |name: &std::path::Path| std::fs::read_to_string(name).unwrap();
    let (before, after): (Vec<_>, Vec<_>) = files
        .iter()
        .partition(|path| path.file_name().unwrap().to_str().unwrap() < "0015");
    for file in before {
        sqlx::raw_sql(sqlx::AssertSqlSafe(run(file)))
            .execute(&pool)
            .await
            .unwrap();
    }
    sqlx::raw_sql(
        "INSERT INTO app_user (email, display_name, password_hash)
         VALUES ('ana@x.io', 'Ana', 'h'), ('gone@x.io', 'Gone', 'h'), ('bob@x.io', 'Bob', 'h');
         UPDATE app_user SET email = 'deleted-' || id || '@deleted.invalid', password_hash = '!'
         WHERE email = 'gone@x.io';
         INSERT INTO project (key, name) VALUES ('P1', 'p');
         INSERT INTO member (project_id, user_id, role)
         SELECT p.id, u.id, CASE u.password_hash WHEN '!' THEN 'admin' ELSE 'member' END
         FROM project p, app_user u WHERE u.email <> 'ana@x.io';",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::raw_sql(sqlx::AssertSqlSafe(run(after[0])))
        .execute(&pool)
        .await
        .unwrap();

    let rows: Vec<(String, bool, Option<String>)> = sqlx::query_as(
        "SELECT u.email, u.deleted_at IS NOT NULL, m.role
         FROM app_user u LEFT JOIN member m ON m.user_id = u.id ORDER BY u.id",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        rows,
        [
            ("ana@x.io".into(), false, None),
            ("erased:2".into(), true, None),
            ("bob@x.io".into(), false, Some("admin".into())),
        ]
    );
}
