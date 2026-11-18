mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

const BAD_KEY: &str =
    "Keys are 2 to 10 characters: a capital letter, then capital letters or digits.";

async fn rename(app: &TestApp, key: &str, body: Value) -> (StatusCode, Value) {
    app.patch(&format!("/api/projects/{key}"), body).await
}

#[sqlx::test]
async fn an_admin_renames_the_project_and_keeps_the_key(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("BAIXA", "scrum").await;

    let (status, project) = rename(&ana, "BAIXA", json!({ "name": " Nowvi " })).await;

    assert_eq!(status, StatusCode::OK, "{project}");
    assert_eq!(project["name"], "Nowvi");
    assert_eq!(project["key"], "BAIXA");
    assert_eq!(project["previous_keys"], json!([]));
    assert_eq!(ana.get("/api/projects/BAIXA").await.1["name"], "Nowvi");
}

#[sqlx::test]
async fn a_new_key_keeps_the_old_one_working_as_an_alias(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("BAIXA", "scrum").await;
    ana.create_project("OTHER", "kanban").await;
    ana.create_issue("BAIXA", json!({ "summary": "Epic", "issue_type": "epic" }))
        .await;
    ana.create_issue("OTHER", json!({ "summary": "Elsewhere" }))
        .await;

    let (status, project) = rename(&ana, "BAIXA", json!({ "name": "Nowvi", "key": "NOWVI" })).await;

    assert_eq!(status, StatusCode::OK, "{project}");
    assert_eq!(project["key"], "NOWVI");
    assert_eq!(project["previous_keys"], json!(["BAIXA"]));
    let (status, old) = ana.get("/api/projects/BAIXA").await;
    assert_eq!(status, StatusCode::OK, "{old}");
    assert_eq!(old["key"], "NOWVI");
    assert_eq!(old["previous_keys"], json!(["BAIXA"]));
    let (status, issue) = ana.get("/api/projects/BAIXA/issues/1").await;
    assert_eq!(status, StatusCode::OK, "{issue}");
    assert_eq!(issue["key"], "NOWVI-1");
    for uri in ["/api/projects/BAIXA/board", "/api/projects/BAIXA/backlog"] {
        assert_eq!(ana.get(uri).await.0, StatusCode::OK, "{uri}");
    }
    let (status, link) = ana
        .post(
            "/api/projects/OTHER/issues/1/links",
            json!({ "issue": "BAIXA-1", "relation": "relates" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{link}");
    assert_eq!(link["issue"]["key"], "NOWVI-1");
    let (status, child) = ana
        .post(
            "/api/projects/NOWVI/issues",
            json!({ "summary": "Child", "parent": "BAIXA-1" }),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED, "{child}");
    assert_eq!(child["parent_key"], "NOWVI-1");
    let (_, found) = ana.get("/api/me/issues/search?q=BAIXA-1").await;
    assert_eq!(found[0]["key"], "NOWVI-1", "{found}");
}

#[sqlx::test]
async fn only_admins_change_the_name_or_key(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    let carol = ana.another_user("carol@example.com").await;
    ana.create_project("BAIXA", "scrum").await;
    ana.add_member("BAIXA", &bob, "member").await;

    let (member, _) = rename(&bob, "BAIXA", json!({ "key": "NOWVI" })).await;
    let (stranger, _) = rename(&carol, "BAIXA", json!({ "key": "NOWVI" })).await;

    assert_eq!(member, StatusCode::FORBIDDEN);
    assert_eq!(stranger, StatusCode::NOT_FOUND);
    assert_eq!(ana.get("/api/projects/BAIXA").await.1["key"], "BAIXA");
}

#[sqlx::test]
async fn an_archived_project_cannot_be_renamed(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("BAIXA", "scrum").await;
    ana.post("/api/projects/BAIXA/archive", json!(null)).await;

    let (status, problem) = rename(&ana, "BAIXA", json!({ "name": "Nowvi" })).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:project-archived");
}

#[sqlx::test]
async fn a_new_key_must_be_upper_case_and_short(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("BAIXA", "scrum").await;

    for bad in ["nowvi", "ABCDEFGHIJK", "1AB"] {
        let (status, problem) = rename(&ana, "BAIXA", json!({ "key": bad })).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{bad}");
        assert_eq!(problem["errors"][0]["field"], "key");
        assert_eq!(problem["errors"][0]["message"], BAD_KEY);
    }
    let (status, _) = rename(&ana, "BAIXA", json!({ "name": "" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn a_key_taken_by_another_project_names_it_only_to_its_members(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("BAIXA", "scrum").await;
    ana.create_project("TAKEN", "scrum").await;
    bob.create_project("BOBS", "scrum").await;

    let (status, problem) = rename(&ana, "BAIXA", json!({ "key": "TAKEN" })).await;
    let (stranger, hidden) = rename(&bob, "BOBS", json!({ "key": "TAKEN" })).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(problem["type"], "urn:santi:error:project-key-taken");
    assert_eq!(problem["detail"], "TAKEN is already Project TAKEN's key.");
    assert_eq!(stranger, StatusCode::CONFLICT);
    assert_eq!(hidden["type"], "urn:santi:error:project-key-taken");
    assert_eq!(hidden["detail"], "TAKEN is taken. Pick another key.");
}

#[sqlx::test]
async fn an_alias_blocks_other_projects_until_its_admin_removes_it(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("BAIXA", "scrum").await;
    bob.create_project("BOBS", "scrum").await;
    rename(&ana, "BAIXA", json!({ "name": "Nowvi", "key": "NOWVI" })).await;
    let alias = "BAIXA is reserved by another project. Pick another key.";

    let (renamed, rename_problem) = rename(&bob, "BOBS", json!({ "key": "BAIXA" })).await;
    let (created, create_problem) = bob
        .post(
            "/api/projects",
            json!({ "key": "BAIXA", "name": "Again", "board_type": "scrum" }),
        )
        .await;

    assert_eq!(renamed, StatusCode::CONFLICT);
    assert_eq!(rename_problem["type"], "urn:santi:error:project-key-alias");
    assert_eq!(rename_problem["detail"], alias);
    assert_eq!(created, StatusCode::CONFLICT);
    assert_eq!(create_problem["detail"], alias);

    let (status, _) = bob.delete("/api/projects/NOWVI/aliases/BAIXA").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    ana.add_member("NOWVI", &bob, "member").await;
    let (status, _) = bob.delete("/api/projects/NOWVI/aliases/BAIXA").await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (_, named) = rename(&bob, "BOBS", json!({ "key": "BAIXA" })).await;
    assert_eq!(
        named["detail"],
        "BAIXA is a previous key of Nowvi. Ask that project's admin to remove it before you can use it."
    );
    let (status, _) = ana.delete("/api/projects/NOWVI/aliases/OTHER").await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, body) = ana.delete("/api/projects/NOWVI/aliases/BAIXA").await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");
    assert_eq!(
        ana.get("/api/projects/NOWVI").await.1["previous_keys"],
        json!([])
    );
    assert_eq!(
        ana.get("/api/projects/BAIXA").await.0,
        StatusCode::NOT_FOUND
    );
    let (status, project) = rename(&bob, "BOBS", json!({ "key": "BAIXA" })).await;
    assert_eq!(status, StatusCode::OK, "{project}");
}

#[sqlx::test]
async fn renaming_back_to_a_previous_key_swaps_it(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("AAA", "scrum").await;
    rename(&ana, "AAA", json!({ "key": "BBB" })).await;
    rename(&ana, "BBB", json!({ "key": "CCC" })).await;

    let (status, project) = rename(&ana, "CCC", json!({ "key": "AAA" })).await;

    assert_eq!(status, StatusCode::OK, "{project}");
    assert_eq!(project["key"], "AAA");
    assert_eq!(project["previous_keys"], json!(["CCC", "BBB"]));
    let (status, same) = rename(&ana, "AAA", json!({ "key": "AAA" })).await;
    assert_eq!(status, StatusCode::OK, "{same}");
    assert_eq!(same["previous_keys"], json!(["CCC", "BBB"]));
}

#[sqlx::test]
async fn export_and_restore_keep_the_previous_keys(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("BAIXA", "scrum").await;
    rename(&ana, "BAIXA", json!({ "key": "NOWVI" })).await;
    let (_, export) = ana.get("/api/me/export").await;
    let file = export["projects"][0].clone();
    assert_eq!(file["project"]["previous_keys"], json!(["BAIXA"]));
    ana.post("/api/projects/NOWVI/trash", json!(null)).await;
    ana.delete("/api/projects/NOWVI").await;

    let (status, restored) = ana.post("/api/projects/restore", file).await;

    assert_eq!(status, StatusCode::CREATED, "{restored}");
    assert_eq!(restored["project"]["previous_keys"], json!(["BAIXA"]));
    assert_eq!(ana.get("/api/projects/BAIXA").await.1["key"], "NOWVI");
}

#[sqlx::test]
async fn a_rename_and_a_create_racing_for_one_key_leave_one_winner(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("BAIXA", "scrum").await;

    let renaming = rename(&ana, "BAIXA", json!({ "key": "NOWVI" }));
    let creating = bob.post(
        "/api/projects",
        json!({ "key": "NOWVI", "name": "Bob's", "board_type": "scrum" }),
    );
    let ((renamed, _), (created, _)) = tokio::join!(renaming, creating);

    let mut statuses = [renamed, created];
    statuses.sort();
    assert!(
        statuses == [StatusCode::OK, StatusCode::CONFLICT]
            || statuses == [StatusCode::CREATED, StatusCode::CONFLICT],
        "{statuses:?}"
    );
}

#[sqlx::test]
async fn an_alias_of_a_trashed_project_tells_its_members_how_it_frees_up(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("BAIXA", "scrum").await;
    ana.create_project("OTHER", "scrum").await;
    bob.create_project("BOBS", "scrum").await;
    rename(&ana, "BAIXA", json!({ "name": "Nowvi", "key": "NOWVI" })).await;
    ana.post("/api/projects/NOWVI/trash", json!(null)).await;

    let (status, member) = rename(&ana, "OTHER", json!({ "key": "BAIXA" })).await;
    let (_, stranger) = rename(&bob, "BOBS", json!({ "key": "BAIXA" })).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(member["type"], "urn:santi:error:project-key-alias");
    assert_eq!(
        member["detail"],
        "BAIXA belongs to Nowvi, which is in the trash; it frees up when the project is restored and the key removed, or deleted for good."
    );
    assert_eq!(
        stranger["detail"],
        "BAIXA is reserved by another project. Pick another key."
    );
}

#[sqlx::test]
async fn old_issue_keys_work_as_parent_filters_and_rank_anchors(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    ana.create_project("BAIXA", "scrum").await;
    ana.create_issue("BAIXA", json!({ "summary": "Epic", "issue_type": "epic" }))
        .await;
    ana.create_issue("BAIXA", json!({ "summary": "Child", "parent": "BAIXA-1" }))
        .await;
    ana.create_issue("BAIXA", json!({ "summary": "Third" }))
        .await;
    rename(&ana, "BAIXA", json!({ "key": "NOWVI" })).await;

    let (status, children) = ana.get("/api/projects/NOWVI/issues?parent=BAIXA-1").await;
    assert_eq!(status, StatusCode::OK, "{children}");
    assert_eq!(children["items"][0]["key"], "NOWVI-2", "{children}");
    let moves = [
        json!({ "after": "BAIXA-2" }),
        json!({ "before": "BAIXA-1" }),
    ];
    for body in moves {
        let (status, moved) = ana
            .post("/api/projects/NOWVI/issues/3/move", body.clone())
            .await;
        assert_eq!(status, StatusCode::OK, "{body} {moved}");
    }
}

#[sqlx::test]
async fn restore_reports_previous_keys_another_project_holds(pool: PgPool) {
    let ana = TestApp::signed_in(pool, "ana@example.com").await;
    let bob = ana.another_user("bob@example.com").await;
    ana.create_project("BAIXA", "scrum").await;
    rename(&ana, "BAIXA", json!({ "key": "NOWVI" })).await;
    let (_, export) = ana.get("/api/me/export").await;
    let file = export["projects"][0].clone();
    ana.post("/api/projects/NOWVI/trash", json!(null)).await;
    ana.delete("/api/projects/NOWVI").await;
    bob.create_project("BAIXA", "scrum").await;

    let (status, restored) = ana.post("/api/projects/restore", file).await;

    assert_eq!(status, StatusCode::CREATED, "{restored}");
    assert_eq!(restored["project"]["previous_keys"], json!([]));
    let messages: Vec<&Value> = restored["problems"]
        .as_array()
        .unwrap()
        .iter()
        .map(|problem| &problem["message"])
        .collect();
    assert!(
        messages.contains(&&json!("Previous key BAIXA stays with another project.")),
        "{restored}"
    );
}
