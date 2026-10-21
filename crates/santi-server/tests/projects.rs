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
async fn members_are_not_added_by_email(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;

    let (add, _) = ana
        .post(
            "/api/projects/SANTI/members",
            json!({ "email": "bob@example.com", "role": "member" }),
        )
        .await;
    let (list, members) = ana.get("/api/projects/SANTI/members").await;

    assert_eq!(add, StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(list, StatusCode::OK);
    assert_eq!(members.as_array().unwrap().len(), 1);
}

#[sqlx::test]
async fn members_cannot_manage_membership(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.add_member("SANTI", &bob, "member").await;

    let (invite, problem) = bob
        .post("/api/projects/SANTI/invites", json!({ "role": "member" }))
        .await;

    assert_eq!(invite, StatusCode::FORBIDDEN);
    assert_eq!(problem["type"], "urn:santi:error:forbidden");
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
    ana.add_member("SANTI", &bob, "member").await;
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
    assert_eq!(
        problem["type"],
        "urn:santi:error:invite-already-used-by-you"
    );
    assert_eq!(
        problem["detail"],
        "You already joined with this link. Ask an admin for a new invite."
    );
    assert_eq!(preview["spots_left"], 2, "{preview}");
    assert_eq!(
        bob.get("/api/projects/SANTI").await.0,
        StatusCode::NOT_FOUND
    );
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

async fn new_invite(admin: &TestApp, key: &str, body: serde_json::Value) -> String {
    let (status, invite) = admin
        .post(&format!("/api/projects/{key}/invites"), body)
        .await;
    assert_eq!(status, StatusCode::CREATED);
    invite["token"].as_str().unwrap().to_string()
}

async fn invite_ids(admin: &TestApp, key: &str) -> Vec<i64> {
    let (_, invites) = admin.get(&format!("/api/projects/{key}/invites")).await;
    invites
        .as_array()
        .unwrap()
        .iter()
        .map(|invite| invite["id"].as_i64().unwrap())
        .collect()
}

#[sqlx::test]
async fn admin_lists_live_invites_with_spots_and_joiners(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let carl = ana.another_user("carl@example.com").await;
    let dora = ana.another_user("dora@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let group = new_invite(&ana, "SANTI", json!({ "role": "member", "max_uses": 3 })).await;
    for guest in [&bob, &carl] {
        guest
            .post(&format!("/api/invites/{group}/accept"), json!(null))
            .await;
    }
    let full = new_invite(&ana, "SANTI", json!({ "role": "member" })).await;
    dora.post(&format!("/api/invites/{full}/accept"), json!(null))
        .await;
    new_invite(&ana, "SANTI", json!({ "role": "member" })).await;
    sqlx::query("UPDATE invite SET expires_at = now() WHERE id = (SELECT max(id) FROM invite)")
        .execute(&pool)
        .await
        .unwrap();
    let single = new_invite(&ana, "SANTI", json!({ "role": "admin" })).await;

    let (status, invites) = ana.get("/api/projects/SANTI/invites").await;

    assert_eq!(status, StatusCode::OK, "{invites}");
    let text = invites.to_string();
    for secret in [group.as_str(), single.as_str(), "token"] {
        assert!(!text.contains(secret), "{secret} leaked");
    }
    let invites = invites.as_array().unwrap();
    assert_eq!(invites.len(), 2);
    assert_eq!(invites[0]["role"], "admin");
    assert_eq!(invites[0]["uses"], 0);
    assert_eq!(invites[0]["joined"], json!([]));
    let mut newest = invites[1].clone();
    let fields = newest.as_object_mut().unwrap();
    for stamp in ["id", "created_at", "expires_at"] {
        assert!(fields.remove(stamp).is_some(), "{stamp} missing");
    }
    for joiner in fields["joined"].as_array_mut().unwrap() {
        assert!(
            joiner
                .as_object_mut()
                .unwrap()
                .remove("joined_at")
                .unwrap()
                .is_string()
        );
    }
    assert_eq!(
        newest,
        json!({
            "role": "member",
            "max_uses": 3,
            "uses": 2,
            "created_by_name": "ana@example.com",
            "joined": [
                { "user_id": bob.user_id, "name": "bob@example.com", "email": "bob@example.com" },
                { "user_id": carl.user_id, "name": "carl@example.com", "email": "carl@example.com" },
            ],
        })
    );
}

#[sqlx::test]
async fn only_admins_see_and_revoke_invites(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let eve = ana.another_user("eve@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.add_member("SANTI", &bob, "member").await;
    new_invite(&ana, "SANTI", json!({ "role": "member" })).await;
    let revoke = format!(
        "/api/projects/SANTI/invites/{}",
        invite_ids(&ana, "SANTI").await[0]
    );

    assert_eq!(
        bob.get("/api/projects/SANTI/invites").await.0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(bob.delete(&revoke).await.0, StatusCode::FORBIDDEN);
    assert_eq!(
        eve.get("/api/projects/SANTI/invites").await.0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(eve.delete(&revoke).await.0, StatusCode::NOT_FOUND);
    assert_eq!(invite_ids(&ana, "SANTI").await.len(), 1);
}

#[sqlx::test]
async fn a_revoked_invite_reads_as_expired_and_joiners_stay(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let carl = ana.another_user("carl@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let token = new_invite(&ana, "SANTI", json!({ "role": "member", "max_uses": 3 })).await;
    bob.post(&format!("/api/invites/{token}/accept"), json!(null))
        .await;
    let revoke = format!(
        "/api/projects/SANTI/invites/{}",
        invite_ids(&ana, "SANTI").await[0]
    );

    let (revoked, _) = ana.delete(&revoke).await;
    let (preview, preview_problem) = carl.get(&format!("/api/invites/{token}")).await;
    let (accept, accept_problem) = carl
        .post(&format!("/api/invites/{token}/accept"), json!(null))
        .await;

    assert_eq!(revoked, StatusCode::NO_CONTENT);
    assert!(invite_ids(&ana, "SANTI").await.is_empty());
    assert_eq!(preview, StatusCode::GONE);
    assert_eq!(preview_problem["type"], "urn:santi:error:invite-expired");
    assert_eq!(accept, StatusCode::GONE);
    assert_eq!(accept_problem["type"], "urn:santi:error:invite-expired");
    assert_eq!(bob.get("/api/projects/SANTI").await.0, StatusCode::OK);
    assert_eq!(ana.delete(&revoke).await.0, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn an_accept_begun_before_a_revoke_commits_cannot_take_the_link(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    let token = new_invite(&ana, "SANTI", json!({ "role": "member" })).await;
    let id = invite_ids(&ana, "SANTI").await[0];
    let mut accept = pool.begin().await.unwrap();

    let (revoked, _) = ana
        .delete(&format!("/api/projects/SANTI/invites/{id}"))
        .await;
    let grant = santi_server::members::repo::take_invite(
        &mut accept,
        &santi_server::auth::domain::hash_token(&token),
    )
    .await
    .unwrap();

    assert_eq!(revoked, StatusCode::NO_CONTENT);
    assert!(grant.is_none());
}

#[sqlx::test]
async fn an_invite_keeps_its_creation_time(pool: PgPool) {
    let ana = TestApp::signed_in(pool.clone(), "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    new_invite(&ana, "SANTI", json!({ "role": "member" })).await;
    let (_, before) = ana.get("/api/projects/SANTI/invites").await;
    sqlx::query("UPDATE invite SET expires_at = expires_at + interval '1 day'")
        .execute(&pool)
        .await
        .unwrap();

    let (_, after) = ana.get("/api/projects/SANTI/invites").await;

    assert_ne!(before[0]["expires_at"], after[0]["expires_at"]);
    assert_eq!(before[0]["created_at"], after[0]["created_at"]);
}

#[sqlx::test]
async fn revoke_answers_404_for_another_projects_or_an_ended_invite(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    ana.create_project("OTHER", "kanban").await;
    new_invite(&ana, "OTHER", json!({ "role": "member" })).await;
    let other_id = invite_ids(&ana, "OTHER").await[0];
    let used = new_invite(&ana, "SANTI", json!({ "role": "member" })).await;
    let used_id = invite_ids(&ana, "SANTI").await[0];
    bob.post(&format!("/api/invites/{used}/accept"), json!(null))
        .await;

    for id in [other_id, used_id, 0] {
        let (status, _) = ana
            .delete(&format!("/api/projects/SANTI/invites/{id}"))
            .await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{id}");
    }
    assert_eq!(invite_ids(&ana, "OTHER").await, [other_id]);
}

#[sqlx::test]
async fn an_archived_project_lists_invites_but_refuses_revoke(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("SANTI", "scrum").await;
    new_invite(&ana, "SANTI", json!({ "role": "member" })).await;
    let id = invite_ids(&ana, "SANTI").await[0];
    ana.post("/api/projects/SANTI/archive", json!(null)).await;

    let (status, problem) = ana
        .delete(&format!("/api/projects/SANTI/invites/{id}"))
        .await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:project-archived");
    assert_eq!(invite_ids(&ana, "SANTI").await, [id]);
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
        "/api/projects/{key}/invites/{id}",
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
