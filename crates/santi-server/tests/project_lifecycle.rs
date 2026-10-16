mod common;

use axum::http::{Method, StatusCode};
use common::{TestApp, body_json, json_request};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn join(admin: &TestApp, key: &str, email: &str, role: &str) {
    let (status, body) = admin
        .post(
            &format!("/api/projects/{key}/members"),
            json!({ "email": email, "role": role }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
}

fn keys(projects: &Value) -> Vec<&str> {
    projects
        .as_array()
        .unwrap()
        .iter()
        .map(|project| project["key"].as_str().unwrap())
        .collect()
}

/// Ana administers SANTI (one issue, one sprint, one comment); Bob is a plain member.
async fn team(pool: PgPool) -> (TestApp, TestApp) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    join(&ana, "SANTI", "bob@example.com", "member").await;
    ana.create_sprint("SANTI").await;
    ana.create_issue("SANTI", json!({ "summary": "Ship it" }))
        .await;
    ana.post(
        "/api/projects/SANTI/issues/1/comments",
        json!({ "body": "On it" }),
    )
    .await;
    (ana, bob)
}

#[sqlx::test]
async fn an_archived_project_leaves_every_list_and_shows_in_the_archived_tab(pool: PgPool) {
    let (ana, bob) = team(pool).await;
    ana.create_project("OTHER", "kanban").await;

    let (archived, _) = ana.post("/api/projects/SANTI/archive", json!(null)).await;

    assert_eq!(archived, StatusCode::NO_CONTENT);
    assert_eq!(keys(&ana.get("/api/projects").await.1), ["OTHER"]);
    assert_eq!(keys(&ana.get("/api/me/projects").await.1), ["OTHER"]);
    let (_, issues) = ana.get("/api/me/issues?view=worked").await;
    assert_eq!(issues["items"].as_array().unwrap().len(), 0);
    let (status, tab) = ana.get("/api/projects?state=archived").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(keys(&tab), ["SANTI"]);
    assert_eq!(tab[0]["state"], "archived");
    assert_eq!(tab[0]["archived_by"], "ana@example.com");
    assert!(tab[0]["archived_at"].is_string());
    assert!(tab[0]["trashed_at"].is_null());
    // The tabs list only projects the caller administers.
    assert!(keys(&bob.get("/api/projects?state=archived").await.1).is_empty());
    let (status, project) = bob.get("/api/projects/SANTI").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(project["state"], "archived");
}

#[sqlx::test]
async fn an_archived_project_is_read_only_except_stars_visits_and_leaving(pool: PgPool) {
    let (ana, bob) = team(pool).await;
    ana.post("/api/projects/SANTI/archive", json!(null)).await;
    let sprint_id = ana.get("/api/projects/SANTI/sprints").await.1[0]["id"].clone();
    let status_id = ana.status_id("SANTI", "To Do").await;
    let column_id = ana.column_id("SANTI", "To Do").await;

    for uri in [
        "/api/projects/SANTI",
        "/api/projects/SANTI/board",
        "/api/projects/SANTI/backlog",
        "/api/projects/SANTI/issues",
        "/api/projects/SANTI/issues/1",
        "/api/projects/SANTI/issues/1/comments",
        "/api/projects/SANTI/members",
        "/api/projects/SANTI/sprints",
        "/api/projects/SANTI/board/settings",
        "/api/projects/SANTI/labels",
    ] {
        assert_eq!(bob.get(uri).await.0, StatusCode::OK, "{uri}");
    }
    let writes = [
        (
            Method::POST,
            "/api/projects/SANTI/issues".to_string(),
            json!({ "summary": "x" }),
        ),
        (
            Method::PATCH,
            "/api/projects/SANTI/issues/1".into(),
            json!({ "summary": "y" }),
        ),
        (
            Method::POST,
            "/api/projects/SANTI/issues/1/move".into(),
            json!({ "status_id": status_id }),
        ),
        (
            Method::DELETE,
            "/api/projects/SANTI/issues/1".into(),
            json!(null),
        ),
        (
            Method::POST,
            "/api/projects/SANTI/issues/1/comments".into(),
            json!({ "body": "z" }),
        ),
        (
            Method::POST,
            "/api/projects/SANTI/sprints".into(),
            json!({}),
        ),
        (
            Method::POST,
            format!("/api/projects/SANTI/sprints/{sprint_id}/start"),
            json!({}),
        ),
        (
            Method::PUT,
            "/api/projects/SANTI/board/settings".into(),
            json!({ "done_window_days": null }),
        ),
        (
            Method::POST,
            "/api/projects/SANTI/board/columns".into(),
            json!({ "name": "QA" }),
        ),
        (
            Method::DELETE,
            format!("/api/projects/SANTI/board/columns/{column_id}"),
            json!(null),
        ),
        (
            Method::POST,
            "/api/projects/SANTI/statuses".into(),
            json!({ "name": "Blocked", "category": "todo" }),
        ),
        (
            Method::POST,
            "/api/projects/SANTI/members".into(),
            json!({ "email": "carl@example.com", "role": "member" }),
        ),
        (
            Method::PUT,
            format!("/api/projects/SANTI/members/{}", bob.user_id),
            json!({ "role": "admin" }),
        ),
        (
            Method::DELETE,
            format!("/api/projects/SANTI/members/{}", bob.user_id),
            json!(null),
        ),
        (
            Method::POST,
            "/api/projects/SANTI/invites".into(),
            json!({ "role": "member" }),
        ),
        (
            Method::POST,
            "/api/projects/SANTI/imports".into(),
            json!({}),
        ),
        (
            Method::POST,
            "/api/projects/SANTI/imports/preview".into(),
            json!({}),
        ),
        (
            Method::POST,
            "/api/projects/SANTI/archive".into(),
            json!(null),
        ),
        (
            Method::PUT,
            format!("/api/projects/SANTI/sprints/{sprint_id}"),
            json!({ "name": "Renamed" }),
        ),
        (
            Method::DELETE,
            format!("/api/projects/SANTI/sprints/{sprint_id}"),
            json!(null),
        ),
        (
            Method::POST,
            format!("/api/projects/SANTI/sprints/{sprint_id}/complete"),
            json!({ "open_issues": { "to": "backlog" } }),
        ),
        (
            Method::PUT,
            "/api/projects/SANTI/board/columns/order".into(),
            json!({ "column_ids": [column_id] }),
        ),
        (
            Method::PUT,
            format!("/api/projects/SANTI/board/columns/{column_id}"),
            json!({ "name": "Next" }),
        ),
        (
            Method::PUT,
            format!("/api/projects/SANTI/statuses/{status_id}"),
            json!({ "name": "Next" }),
        ),
        (
            Method::DELETE,
            format!("/api/projects/SANTI/statuses/{status_id}"),
            json!(null),
        ),
    ];
    for (method, uri, body) in writes {
        let request = json_request(method.clone(), &uri, ana.token.as_deref(), Some(body));
        let response = ana.send(request).await;
        let status = response.status();
        let problem = body_json(response).await;
        assert_eq!(status, StatusCode::CONFLICT, "{method} {uri}: {problem}");
        assert_eq!(problem["type"], "urn:santi:error:project-archived", "{uri}");
    }

    let (starred, _) = bob.post("/api/me/stars", json!({ "key": "SANTI" })).await;
    let (issue_starred, _) = bob.post("/api/me/stars", json!({ "key": "SANTI-1" })).await;
    let (unstarred, _) = bob.delete("/api/me/stars/SANTI").await;
    let visited = bob
        .browser_post("bob@example.com", "/api/projects/SANTI/visit")
        .await;
    let viewed = bob
        .browser_post("bob@example.com", "/api/projects/SANTI/issues/1/view")
        .await;
    let (left, _) = bob
        .delete(&format!("/api/projects/SANTI/members/{}", bob.user_id))
        .await;

    assert_eq!(starred, StatusCode::NO_CONTENT);
    assert_eq!(issue_starred, StatusCode::NO_CONTENT);
    assert_eq!(unstarred, StatusCode::NO_CONTENT);
    assert_eq!(visited, StatusCode::NO_CONTENT);
    assert_eq!(viewed, StatusCode::NO_CONTENT);
    assert_eq!(left, StatusCode::NO_CONTENT);
    assert_eq!(
        bob.get("/api/projects/SANTI").await.0,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn admins_archive_and_unarchive_and_others_cannot(pool: PgPool) {
    let (ana, bob) = team(pool).await;
    let carl = ana.another_user("carl@example.com").await;

    let (by_member, _) = bob.post("/api/projects/SANTI/archive", json!(null)).await;
    let (by_stranger, _) = carl.post("/api/projects/SANTI/archive", json!(null)).await;
    let (not_archived, problem) = ana.post("/api/projects/SANTI/unarchive", json!(null)).await;
    ana.post("/api/projects/SANTI/archive", json!(null)).await;
    let (unarchive_by_member, _) = bob.post("/api/projects/SANTI/unarchive", json!(null)).await;
    let (unarchived, _) = ana.post("/api/projects/SANTI/unarchive", json!(null)).await;

    assert_eq!(by_member, StatusCode::FORBIDDEN);
    assert_eq!(by_stranger, StatusCode::NOT_FOUND);
    assert_eq!(not_archived, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:project-not-archived");
    assert_eq!(unarchive_by_member, StatusCode::FORBIDDEN);
    assert_eq!(unarchived, StatusCode::NO_CONTENT);
    assert_eq!(keys(&bob.get("/api/projects").await.1), ["SANTI"]);
    let (_, project) = ana.get("/api/projects/SANTI").await;
    assert_eq!(project["state"], "active");
    assert!(project["archived_at"].is_null());
    let (created, _) = ana
        .post("/api/projects/SANTI/issues", json!({ "summary": "Again" }))
        .await;
    assert_eq!(created, StatusCode::CREATED);
}

#[sqlx::test]
async fn a_trashed_project_answers_not_found_to_everyone(pool: PgPool) {
    let (ana, bob) = team(pool).await;
    let (by_member, _) = bob.post("/api/projects/SANTI/trash", json!(null)).await;

    let (trashed, _) = ana.post("/api/projects/SANTI/trash", json!(null)).await;

    assert_eq!(by_member, StatusCode::FORBIDDEN);
    assert_eq!(trashed, StatusCode::NO_CONTENT);
    for uri in [
        "/api/projects/SANTI",
        "/api/projects/SANTI/board",
        "/api/projects/SANTI/issues/1",
        "/api/projects/SANTI/members",
    ] {
        assert_eq!(ana.get(uri).await.0, StatusCode::NOT_FOUND, "{uri}");
    }
    for (method, uri) in [
        (Method::POST, "/api/projects/SANTI/issues"),
        (Method::POST, "/api/projects/SANTI/unarchive"),
        (Method::POST, "/api/projects/SANTI/trash"),
    ] {
        let request = json_request(method, uri, ana.token.as_deref(), Some(json!({})));
        assert_eq!(ana.send(request).await.status(), StatusCode::NOT_FOUND);
    }
    assert!(keys(&ana.get("/api/projects").await.1).is_empty());
    assert!(keys(&ana.get("/api/me/projects").await.1).is_empty());
    assert!(keys(&ana.get("/api/projects?state=archived").await.1).is_empty());
    let (_, issues) = ana.get("/api/me/issues?view=worked").await;
    assert_eq!(issues["items"].as_array().unwrap().len(), 0);
    let (star, _) = ana.post("/api/me/stars", json!({ "key": "SANTI" })).await;
    let (issue_star, _) = ana.post("/api/me/stars", json!({ "key": "SANTI-1" })).await;
    assert_eq!(star, StatusCode::NOT_FOUND);
    assert_eq!(issue_star, StatusCode::NOT_FOUND);

    let (_, tab) = ana.get("/api/projects?state=trashed").await;
    assert_eq!(keys(&tab), ["SANTI"]);
    assert_eq!(tab[0]["state"], "trashed");
    assert_eq!(tab[0]["trashed_by"], "ana@example.com");
    let trashed_at: chrono::DateTime<chrono::Utc> =
        tab[0]["trashed_at"].as_str().unwrap().parse().unwrap();
    let purge_at: chrono::DateTime<chrono::Utc> =
        tab[0]["purge_at"].as_str().unwrap().parse().unwrap();
    assert_eq!(purge_at - trashed_at, chrono::Duration::days(60));
    assert!(keys(&bob.get("/api/projects?state=trashed").await.1).is_empty());
}

#[sqlx::test]
async fn admins_restore_from_the_trash(pool: PgPool) {
    let (ana, bob) = team(pool).await;
    let carl = ana.another_user("carl@example.com").await;
    let (not_trashed, problem) = ana.post("/api/projects/SANTI/restore", json!(null)).await;
    ana.post("/api/projects/SANTI/trash", json!(null)).await;

    let (by_member, _) = bob.post("/api/projects/SANTI/restore", json!(null)).await;
    let (by_stranger, _) = carl.post("/api/projects/SANTI/restore", json!(null)).await;
    let (unknown, _) = ana.post("/api/projects/NOPE/restore", json!(null)).await;
    let (restored, _) = ana.post("/api/projects/SANTI/restore", json!(null)).await;

    assert_eq!(not_trashed, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:project-not-trashed");
    assert_eq!(by_member, StatusCode::NOT_FOUND);
    assert_eq!(by_stranger, StatusCode::NOT_FOUND);
    assert_eq!(unknown, StatusCode::NOT_FOUND);
    assert_eq!(restored, StatusCode::NO_CONTENT);
    let (_, project) = bob.get("/api/projects/SANTI").await;
    assert_eq!(project["state"], "active");
    assert!(project["trashed_at"].is_null());
    assert_eq!(
        bob.get("/api/projects/SANTI/issues/1").await.0,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn purge_deletes_a_trashed_project_with_everything_it_owns(pool: PgPool) {
    let (ana, bob) = team(pool.clone()).await;
    let sprint_id = ana.get("/api/projects/SANTI/sprints").await.1[0]["id"].clone();
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Sprinted", "sprint_id": sprint_id }),
    )
    .await;
    ana.create_issue(
        "SANTI",
        json!({ "summary": "Child", "issue_type": "subtask", "parent": "SANTI-2" }),
    )
    .await;
    let (started, body) = ana
        .post(
            &format!("/api/projects/SANTI/sprints/{sprint_id}/start"),
            json!({}),
        )
        .await;
    assert_eq!(started, StatusCode::OK, "{body}");
    let (completed, body) = ana
        .post(
            &format!("/api/projects/SANTI/sprints/{sprint_id}/complete"),
            json!({ "open_issues": { "to": "backlog" } }),
        )
        .await;
    assert_eq!(completed, StatusCode::OK, "{body}");
    ana.post("/api/me/stars", json!({ "key": "SANTI-1" })).await;
    ana.post("/api/projects/SANTI/invites", json!({ "role": "member" }))
        .await;
    let (live, problem) = ana.delete("/api/projects/SANTI").await;
    ana.post("/api/projects/SANTI/trash", json!(null)).await;

    let (by_member, _) = bob.delete("/api/projects/SANTI").await;
    let (purged, _) = ana.delete("/api/projects/SANTI").await;

    assert_eq!(live, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:project-not-trashed");
    assert_eq!(by_member, StatusCode::NOT_FOUND);
    assert_eq!(purged, StatusCode::NO_CONTENT);
    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT table_name::text FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
           AND table_name NOT IN ('_sqlx_migrations', 'app_user', 'auth_token', 'legal_acceptance')",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(tables.len() >= 12, "{tables:?}");
    for table in tables {
        let count: i64 =
            sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT count(*) FROM {table}")))
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 0, "{table}");
    }
    ana.create_project("SANTI", "kanban").await;
}

#[sqlx::test]
async fn the_hourly_purge_removes_projects_trashed_sixty_days_ago(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    for key in ["OLD", "NEW", "LIVE"] {
        ana.create_project(key, "scrum").await;
    }
    ana.post("/api/projects/OLD/trash", json!(null)).await;
    ana.post("/api/projects/NEW/trash", json!(null)).await;
    sqlx::query(
        "UPDATE project SET trashed_at = now() - interval '60 days 1 minute' WHERE key = 'OLD'",
    )
    .execute(&pool)
    .await
    .unwrap();

    let purged = santi_server::purge_trash(&pool).await.unwrap();

    assert_eq!(purged, 1);
    assert_eq!(
        keys(&ana.get("/api/projects?state=trashed").await.1),
        ["NEW"]
    );
    assert_eq!(keys(&ana.get("/api/projects").await.1), ["LIVE"]);
}

#[sqlx::test]
async fn the_hourly_purge_skips_a_project_it_cannot_delete_and_purges_the_rest(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    for key in ["BAD", "OLD"] {
        ana.create_project(key, "scrum").await;
        ana.post(&format!("/api/projects/{key}/trash"), json!(null))
            .await;
    }
    sqlx::query("UPDATE project SET trashed_at = now() - interval '61 days'")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::raw_sql(
        "CREATE FUNCTION refuse_bad() RETURNS trigger LANGUAGE plpgsql AS
           $$ BEGIN RAISE EXCEPTION 'refused'; END $$;
         CREATE TRIGGER refuse_bad BEFORE DELETE ON project
           FOR EACH ROW WHEN (OLD.key = 'BAD') EXECUTE FUNCTION refuse_bad();",
    )
    .execute(&pool)
    .await
    .unwrap();

    let purged = santi_server::purge_trash(&pool).await.unwrap();

    assert_eq!(purged, 1);
    assert_eq!(
        keys(&ana.get("/api/projects?state=trashed").await.1),
        ["BAD"]
    );
}

#[sqlx::test]
async fn an_archived_project_can_be_trashed_and_restores_active(pool: PgPool) {
    let (ana, _bob) = team(pool).await;
    ana.post("/api/projects/SANTI/archive", json!(null)).await;

    let (trashed, body) = ana.post("/api/projects/SANTI/trash", json!(null)).await;

    assert_eq!(trashed, StatusCode::NO_CONTENT, "{body}");
    assert!(keys(&ana.get("/api/projects?state=archived").await.1).is_empty());
    let (_, tab) = ana.get("/api/projects?state=trashed").await;
    assert_eq!(keys(&tab), ["SANTI"]);
    assert!(tab[0]["archived_at"].is_null());
    let (restored, _) = ana.post("/api/projects/SANTI/restore", json!(null)).await;
    assert_eq!(restored, StatusCode::NO_CONTENT);
    let (_, project) = ana.get("/api/projects/SANTI").await;
    assert_eq!(project["state"], "active");
}

/// A write that passed the extractor while the project was active re-checks the state under
/// the project lock, so an archive or trash committed in between wins.
#[sqlx::test]
async fn writes_under_the_project_lock_recheck_its_state(pool: PgPool) {
    use santi_server::{issues, members, projects};
    let (ana, bob) = team(pool.clone()).await;
    let mut conn = pool.acquire().await.unwrap();
    let stale_ana = members::repo::find_member(&mut conn, "SANTI", ana.user_id)
        .await
        .unwrap()
        .unwrap();
    let stale_bob = members::repo::find_member(&mut conn, "SANTI", bob.user_id)
        .await
        .unwrap()
        .unwrap();
    let to_do = ana.status_id("SANTI", "To Do").await;
    let new_issue = || serde_json::from_value(json!({ "summary": "Late" })).unwrap();
    let move_to = || serde_json::from_value(json!({ "status_id": to_do })).unwrap();
    let admin = || serde_json::from_value(json!({ "role": "admin" })).unwrap();
    ana.post("/api/projects/SANTI/archive", json!(null)).await;

    let archived = Some(projects::domain::archived());
    assert_eq!(
        issues::service::create_issue(&pool, &stale_ana, new_issue())
            .await
            .err(),
        archived
    );
    assert_eq!(
        issues::service::move_issue(&pool, &stale_ana, 1, move_to())
            .await
            .err(),
        archived
    );
    assert_eq!(
        members::service::set_role(&pool, &stale_ana, bob.user_id, admin())
            .await
            .err(),
        archived
    );
    assert_eq!(
        members::service::remove_member(&pool, &stale_ana, bob.user_id)
            .await
            .err(),
        archived
    );
    ana.post("/api/projects/SANTI/unarchive", json!(null)).await;
    ana.post("/api/projects/SANTI/trash", json!(null)).await;
    let gone = Some(santi_server::error::AppError::NotFound);
    assert_eq!(
        issues::service::create_issue(&pool, &stale_ana, new_issue())
            .await
            .err(),
        gone
    );
    assert_eq!(
        issues::service::move_issue(&pool, &stale_ana, 1, move_to())
            .await
            .err(),
        gone
    );
    assert_eq!(
        members::service::remove_member(&pool, &stale_bob, bob.user_id)
            .await
            .err(),
        gone
    );
}

#[sqlx::test]
async fn an_archived_or_trashed_project_keeps_its_key(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("ARC", "scrum").await;
    ana.create_project("BIN", "scrum").await;
    ana.post("/api/projects/ARC/archive", json!(null)).await;
    ana.post("/api/projects/BIN/trash", json!(null)).await;

    for (key, state) in [("ARC", "archived"), ("BIN", "in the trash")] {
        let (status, problem) = bob
            .post(
                "/api/projects",
                json!({ "key": key, "name": "Mine", "board_type": "kanban" }),
            )
            .await;
        assert_eq!(status, StatusCode::CONFLICT, "{key}");
        assert_eq!(problem["type"], "urn:santi:error:project-key-held");
        let detail = problem["detail"].as_str().unwrap();
        assert!(detail.contains(key) && detail.contains(state), "{detail}");
    }
}

#[sqlx::test]
async fn invites_to_an_archived_or_trashed_project_cannot_be_used(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let mut tokens = Vec::new();
    for key in ["ARC", "BIN"] {
        ana.create_project(key, "scrum").await;
        let (_, invite) = ana
            .post(
                &format!("/api/projects/{key}/invites"),
                json!({ "role": "member" }),
            )
            .await;
        tokens.push(invite["token"].as_str().unwrap().to_string());
    }
    ana.post("/api/projects/ARC/archive", json!(null)).await;
    ana.post("/api/projects/BIN/trash", json!(null)).await;

    let (archived, problem) = bob
        .post(&format!("/api/invites/{}/accept", tokens[0]), json!(null))
        .await;
    let (trashed, _) = bob
        .post(&format!("/api/invites/{}/accept", tokens[1]), json!(null))
        .await;
    let (preview, _) = bob.get(&format!("/api/invites/{}", tokens[1])).await;
    let (archived_preview, preview_problem) = bob.get(&format!("/api/invites/{}", tokens[0])).await;

    assert_eq!(archived, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:project-archived");
    assert_eq!(trashed, StatusCode::NOT_FOUND);
    assert_eq!(preview, StatusCode::NOT_FOUND);
    assert_eq!(archived_preview, StatusCode::CONFLICT);
    assert_eq!(preview_problem["type"], "urn:santi:error:project-archived");
}

#[sqlx::test]
async fn a_member_leaves_a_project_but_cannot_remove_others(pool: PgPool) {
    let (ana, bob) = team(pool).await;
    let carl = ana.another_user("carl@example.com").await;
    join(&ana, "SANTI", "carl@example.com", "member").await;

    let (removes_carl, _) = bob
        .delete(&format!("/api/projects/SANTI/members/{}", carl.user_id))
        .await;
    let (leaves, _) = bob
        .delete(&format!("/api/projects/SANTI/members/{}", bob.user_id))
        .await;

    assert_eq!(removes_carl, StatusCode::FORBIDDEN);
    assert_eq!(leaves, StatusCode::NO_CONTENT);
    assert!(keys(&bob.get("/api/projects").await.1).is_empty());
}

#[sqlx::test]
async fn the_export_lists_archived_and_trashed_projects_with_their_state(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    for key in ["ARC", "BIN", "LIVE"] {
        ana.create_project(key, "scrum").await;
        join(&ana, key, "bob@example.com", "member").await;
    }
    ana.post("/api/projects/ARC/archive", json!(null)).await;
    ana.post("/api/projects/BIN/trash", json!(null)).await;

    let (status, export) = ana.get("/api/me/export").await;

    assert_eq!(status, StatusCode::OK);
    let states: Vec<(&str, &str)> = export["projects"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| {
            (
                entry["project"]["key"].as_str().unwrap(),
                entry["project"]["state"].as_str().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        states,
        [("ARC", "archived"), ("BIN", "trashed"), ("LIVE", "active")]
    );
    let (_, export) = bob.get("/api/me/export").await;
    assert_eq!(keys(&export["other_projects"]), ["LIVE"]);
}

#[sqlx::test]
async fn lifecycle_routes_are_in_the_api_contract(_pool: PgPool) {
    let api = serde_json::to_value(santi_server::openapi()).unwrap();
    for (path, method) in [
        ("/api/projects/{key}/archive", "post"),
        ("/api/projects/{key}/unarchive", "post"),
        ("/api/projects/{key}/trash", "post"),
        ("/api/projects/{key}/restore", "post"),
        ("/api/projects/{key}", "delete"),
    ] {
        assert!(api["paths"][path][method].is_object(), "{method} {path}");
    }
}
