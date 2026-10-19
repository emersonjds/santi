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
    let (reused, reused_problem) = carl.post(&accept, json!(null)).await;
    let (unknown, _) = carl
        .post("/api/invites/santi_unknown/accept", json!(null))
        .await;

    assert_eq!(created, StatusCode::CREATED);
    assert_eq!(accepted, StatusCode::OK);
    assert_eq!(project["role"], "member");
    assert_eq!(reused, StatusCode::GONE);
    assert_eq!(reused_problem["type"], "urn:santi:error:invite-used");
    assert_eq!(unknown, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn a_group_invite_lets_each_spot_join_once(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let mut guests = Vec::new();
    for name in ["bob", "carl", "dora", "eve"] {
        guests.push(ana.another_user(&format!("{name}@example.com")).await);
    }
    ana.create_project("SANTI", "scrum").await;

    let (created, invite) = ana
        .post(
            "/api/projects/SANTI/invites",
            json!({ "role": "member", "max_uses": 3 }),
        )
        .await;
    let accept = format!("/api/invites/{}/accept", invite["token"].as_str().unwrap());
    let mut joined = Vec::new();
    for guest in &guests[..3] {
        joined.push(guest.post(&accept, json!(null)).await.0);
    }
    let (fourth, problem) = guests[3].post(&accept, json!(null)).await;
    let uses: i64 = sqlx::query_scalar("SELECT count(*) FROM invite_use")
        .fetch_one(&pool)
        .await
        .unwrap();

    assert_eq!(created, StatusCode::CREATED);
    assert_eq!(invite["max_uses"], 3);
    assert_eq!(joined, [StatusCode::OK; 3]);
    assert_eq!(fourth, StatusCode::GONE);
    assert_eq!(problem["type"], "urn:santi:error:invite-used");
    assert_eq!(uses, 3);
}

#[sqlx::test]
async fn group_invite_preview_counts_spots_left(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let carl = ana.another_user("carl@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let (_, invite) = ana
        .post(
            "/api/projects/SANTI/invites",
            json!({ "role": "member", "max_uses": 3 }),
        )
        .await;
    let token = invite["token"].as_str().unwrap();
    bob.post(&format!("/api/invites/{token}/accept"), json!(null))
        .await;

    let (status, preview) = carl.get(&format!("/api/invites/{token}")).await;

    assert_eq!(status, StatusCode::OK, "{preview}");
    assert_eq!(preview["max_uses"], 3);
    assert_eq!(preview["spots_left"], 2);
}

#[sqlx::test]
async fn an_existing_member_takes_no_spot(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let (_, invite) = ana
        .post("/api/projects/SANTI/invites", json!({ "role": "member" }))
        .await;
    let token = invite["token"].as_str().unwrap();

    let (member, _) = ana
        .post(&format!("/api/invites/{token}/accept"), json!(null))
        .await;
    let (_, preview) = bob.get(&format!("/api/invites/{token}")).await;
    let (joined, _) = bob
        .post(&format!("/api/invites/{token}/accept"), json!(null))
        .await;

    assert_eq!(member, StatusCode::CONFLICT);
    assert_eq!(preview["spots_left"], 1, "{preview}");
    assert_eq!(joined, StatusCode::OK);
}

#[sqlx::test]
async fn a_removed_member_cannot_rejoin_with_the_same_link(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let (_, invite) = ana
        .post(
            "/api/projects/SANTI/invites",
            json!({ "role": "member", "max_uses": 3 }),
        )
        .await;
    let token = invite["token"].as_str().unwrap();
    let accept = format!("/api/invites/{token}/accept");
    bob.post(&accept, json!(null)).await;
    let (removed, _) = ana
        .delete(&format!("/api/projects/SANTI/members/{}", bob.user_id))
        .await;

    let (again, problem) = bob.post(&accept, json!(null)).await;
    let (_, preview) = bob.get(&format!("/api/invites/{token}")).await;

    assert_eq!(removed, StatusCode::NO_CONTENT);
    assert_eq!(again, StatusCode::CONFLICT, "{problem}");
    assert_eq!(problem["type"], "urn:santi:error:invite-already-used-by-you");
    assert_eq!(
        problem["detail"],
        "You already joined with this link. Ask an admin for a new invite."
    );
    assert_eq!(preview["spots_left"], 2, "{preview}");
    assert_eq!(bob.get("/api/projects/SANTI").await.0, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn concurrent_accepts_never_take_more_spots_than_the_link_has(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let mut guests = Vec::new();
    for number in 0..5 {
        guests.push(
            ana.another_user(&format!("guest{number}@example.com"))
                .await,
        );
    }
    ana.create_project("SANTI", "scrum").await;
    let (_, invite) = ana
        .post(
            "/api/projects/SANTI/invites",
            json!({ "role": "member", "max_uses": 2 }),
        )
        .await;
    let accept = format!("/api/invites/{}/accept", invite["token"].as_str().unwrap());

    let mut accepts = tokio::task::JoinSet::new();
    for guest in guests {
        let accept = accept.clone();
        accepts.spawn(async move { guest.post(&accept, json!(null)).await.0 });
    }
    let mut statuses = accepts.join_all().await;
    statuses.sort();

    assert_eq!(
        statuses,
        [
            StatusCode::OK,
            StatusCode::OK,
            StatusCode::GONE,
            StatusCode::GONE,
            StatusCode::GONE
        ]
    );
}

#[sqlx::test]
async fn invite_spots_are_validated(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;

    for spots in [0, 51] {
        let (status, problem) = ana
            .post(
                "/api/projects/SANTI/invites",
                json!({ "role": "member", "max_uses": spots }),
            )
            .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
        assert_eq!(problem["errors"][0]["field"], "max_uses", "{problem}");
        assert_eq!(problem["errors"][0]["message"], "Between 1 and 50.");
    }
    let (admins, problem) = ana
        .post(
            "/api/projects/SANTI/invites",
            json!({ "role": "admin", "max_uses": 2 }),
        )
        .await;
    assert_eq!(admins, StatusCode::UNPROCESSABLE_ENTITY, "{problem}");
    assert_eq!(
        problem["errors"][0],
        json!({
            "field": "max_uses",
            "message": "A link for more than one person can only add members."
        })
    );
    let (_, single) = ana
        .post("/api/projects/SANTI/invites", json!({ "role": "member" }))
        .await;
    assert_eq!(single["max_uses"], 1);
}

#[sqlx::test]
async fn expired_invite_is_gone(pool: PgPool) {
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

    let (status, problem) = bob
        .post(
            &format!("/api/invites/{}/accept", invite["token"].as_str().unwrap()),
            json!(null),
        )
        .await;

    assert_eq!(status, StatusCode::GONE);
    assert_eq!(problem["type"], "urn:santi:error:invite-expired");
}

#[sqlx::test]
async fn invite_preview_shows_what_the_link_grants(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let anonymous = TestApp::anonymous(pool.clone());
    ana.create_project("SANTI", "scrum").await;
    let (_, invite) = ana
        .post("/api/projects/SANTI/invites", json!({ "role": "admin" }))
        .await;
    let preview_url = format!("/api/invites/{}", invite["token"].as_str().unwrap());

    let (status, mut preview) = bob.get(&preview_url).await;
    let expires_at = preview.as_object_mut().unwrap().remove("expires_at");

    assert_eq!(status, StatusCode::OK, "{preview}");
    assert!(expires_at.is_some_and(|stamp| stamp.is_string()));
    assert_eq!(
        preview,
        json!({
            "project_key": "SANTI",
            "project_name": "Project SANTI",
            "role": "admin",
            "inviter_name": "ana@example.com",
            "max_uses": 1,
            "spots_left": 1,
        })
    );
    assert_eq!(
        anonymous.get(&preview_url).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        bob.get("/api/invites/santi_unknown").await.0,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn used_or_expired_invites_preview_as_gone(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let carl = ana.another_user("carl@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let (_, used) = ana
        .post("/api/projects/SANTI/invites", json!({ "role": "member" }))
        .await;
    let used = used["token"].as_str().unwrap().to_string();
    bob.post(&format!("/api/invites/{used}/accept"), json!(null))
        .await;
    let (_, expired) = ana
        .post("/api/projects/SANTI/invites", json!({ "role": "member" }))
        .await;
    sqlx::query("UPDATE invite SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL")
        .execute(&pool)
        .await
        .unwrap();

    let (used_status, used_problem) = carl.get(&format!("/api/invites/{used}")).await;
    let (expired_status, expired_problem) = carl
        .get(&format!(
            "/api/invites/{}",
            expired["token"].as_str().unwrap()
        ))
        .await;

    assert_eq!(used_status, StatusCode::GONE);
    assert_eq!(used_problem["type"], "urn:santi:error:invite-used");
    assert_eq!(expired_status, StatusCode::GONE);
    assert_eq!(expired_problem["type"], "urn:santi:error:invite-expired");
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
        "/api/invites/{token}",
        "/api/invites/{token}/accept",
    ] {
        assert!(api["paths"][path].is_object(), "{path} missing");
    }
}

#[sqlx::test]
async fn unknown_tokens_get_401_on_project_routes(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let forged = TestApp {
        token: Some("santi_forged".into()),
        ..ana.clone()
    };

    assert_eq!(
        forged.get("/api/projects/SANTI/board").await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        forged.get("/api/projects/NOPE/board").await.0,
        StatusCode::UNAUTHORIZED
    );
}
