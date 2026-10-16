mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test]
async fn creator_becomes_admin_of_a_new_project(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;

    let project = ana.create_project("santi", "scrum").await;

    assert_eq!(project["key"], "SANTI");
    assert_eq!(project["board_type"], "scrum");
    assert_eq!(project["role"], "admin");
}

#[sqlx::test]
async fn project_key_is_validated_and_unique(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;

    let (invalid, problem) = ana
        .post(
            "/api/projects",
            json!({ "key": "1X", "name": "x", "board_type": "scrum" }),
        )
        .await;
    let (duplicate, _) = ana
        .post(
            "/api/projects",
            json!({ "key": "SANTI", "name": "x", "board_type": "kanban" }),
        )
        .await;

    assert_eq!(invalid, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "key");
    assert_eq!(duplicate, StatusCode::CONFLICT);
}

#[sqlx::test]
async fn project_list_shows_only_my_projects(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("ANA", "scrum").await;
    bob.create_project("BOB", "kanban").await;

    let (_, projects) = ana.get("/api/projects").await;

    let keys: Vec<&str> = projects
        .as_array()
        .unwrap()
        .iter()
        .map(|project| project["key"].as_str().unwrap())
        .collect();
    assert_eq!(keys, ["ANA"]);
}

#[sqlx::test]
async fn non_members_and_unknown_keys_get_not_found(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;

    assert_eq!(
        bob.get("/api/projects/SANTI").await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(ana.get("/api/projects/NOPE").await.0, StatusCode::NOT_FOUND);
    assert_eq!(ana.get("/api/projects/SANTI").await.0, StatusCode::OK);
}

#[sqlx::test]
async fn admin_adds_a_member_by_email(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;

    let (status, added) = ana
        .post(
            "/api/projects/SANTI/members",
            json!({ "email": "BOB@example.com", "role": "member" }),
        )
        .await;
    let (_, members) = bob.get("/api/projects/SANTI/members").await;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(added["user_id"], bob.user_id);
    assert_eq!(members.as_array().unwrap().len(), 2);
}

#[sqlx::test]
async fn adding_unknown_or_existing_members_fails(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;

    let (unknown, problem) = ana
        .post(
            "/api/projects/SANTI/members",
            json!({ "email": "zed@example.com", "role": "member" }),
        )
        .await;
    let (existing, _) = ana
        .post(
            "/api/projects/SANTI/members",
            json!({ "email": "ana@example.com", "role": "member" }),
        )
        .await;

    assert_eq!(unknown, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(problem["errors"][0]["field"], "email");
    assert_eq!(existing, StatusCode::CONFLICT);
}

#[sqlx::test]
async fn members_cannot_manage_membership(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.post(
        "/api/projects/SANTI/members",
        json!({ "email": "bob@example.com", "role": "member" }),
    )
    .await;

    let (add, problem) = bob
        .post(
            "/api/projects/SANTI/members",
            json!({ "email": "ana@example.com", "role": "admin" }),
        )
        .await;
    let (invite, _) = bob
        .post("/api/projects/SANTI/invites", json!({ "role": "member" }))
        .await;

    assert_eq!(add, StatusCode::FORBIDDEN);
    assert_eq!(problem["type"], "urn:santi:error:forbidden");
    assert_eq!(invite, StatusCode::FORBIDDEN);
}

#[sqlx::test]
async fn the_last_admin_stays(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let me = format!("/api/projects/SANTI/members/{}", ana.user_id);

    let (demote, problem) = ana.put(&me, json!({ "role": "member" })).await;
    let (remove, _) = ana.delete(&me).await;

    assert_eq!(demote, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:last-admin");
    assert_eq!(remove, StatusCode::CONFLICT);
}

#[sqlx::test]
async fn admin_changes_roles_and_removes_members(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.post(
        "/api/projects/SANTI/members",
        json!({ "email": "bob@example.com", "role": "member" }),
    )
    .await;
    let bob_url = format!("/api/projects/SANTI/members/{}", bob.user_id);

    let (_, promoted) = ana.put(&bob_url, json!({ "role": "admin" })).await;
    let (removed, _) = ana.delete(&bob_url).await;

    assert_eq!(promoted["role"], "admin");
    assert_eq!(removed, StatusCode::NO_CONTENT);
    assert_eq!(
        bob.get("/api/projects/SANTI").await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(ana.delete(&bob_url).await.0, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn invite_link_adds_the_member_once(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let carl = ana.another_user("carl@example.com").await;
    ana.create_project("SANTI", "scrum").await;

    let (created, invite) = ana
        .post("/api/projects/SANTI/invites", json!({ "role": "member" }))
        .await;
    let accept = format!("/api/invites/{}/accept", invite["token"].as_str().unwrap());
    let (accepted, project) = bob.post(&accept, json!(null)).await;
    let (reused, _) = carl.post(&accept, json!(null)).await;

    assert_eq!(created, StatusCode::CREATED);
    assert_eq!(accepted, StatusCode::OK);
    assert_eq!(project["role"], "member");
    assert_eq!(reused, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn expired_invite_is_not_found(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let (_, invite) = ana
        .post("/api/projects/SANTI/invites", json!({ "role": "member" }))
        .await;
    sqlx::query("UPDATE invite SET expires_at = now() - interval '1 minute'")
        .execute(&pool)
        .await
        .unwrap();

    let (status, _) = bob
        .post(
            &format!("/api/invites/{}/accept", invite["token"].as_str().unwrap()),
            json!(null),
        )
        .await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn projects_require_sign_in(pool: PgPool) {
    let anonymous = TestApp::anonymous(pool);

    assert_eq!(
        anonymous.get("/api/projects").await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        anonymous.get("/api/projects/SANTI").await.0,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test]
async fn openapi_lists_project_routes(pool: PgPool) {
    let app = TestApp::anonymous(pool);

    let (_, api) = app.get("/openapi.json").await;

    for path in [
        "/api/projects",
        "/api/projects/{key}",
        "/api/projects/{key}/members",
        "/api/projects/{key}/members/{user_id}",
        "/api/projects/{key}/invites",
        "/api/invites/{token}/accept",
    ] {
        assert!(api["paths"][path].is_object(), "{path} missing");
    }
}
