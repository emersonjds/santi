//! SAN-214: the issue search predicate stays indexable, so a large project is not scanned row by row.

use chrono::{DateTime, Utc};
use santi_server::seed::{self, SeedSize};
use sqlx::PgPool;

const SEARCH_SQL: &str = include_str!("../src/issues/search_issues.sql");

async fn plan(pool: &PgPool, project_id: i64, pattern: &str, number: Option<i64>) -> String {
    let rows: Vec<String> =
        sqlx::query_scalar(sqlx::AssertSqlSafe(format!("EXPLAIN {SEARCH_SQL}")))
            .bind(project_id)
            .bind(0_i64)
            .bind(Vec::<i64>::new())
            .bind(Vec::<String>::new())
            .bind(Vec::<String>::new())
            .bind(Vec::<i64>::new())
            .bind(false)
            .bind(pattern)
            .bind(None::<DateTime<Utc>>)
            .bind(Vec::<String>::new())
            .bind(51_i64)
            .bind(false)
            .bind(number)
            .fetch_all(pool)
            .await
            .unwrap();
    rows.join("\n")
}

/// At 5,000 rows in the project the planner rightly prefers the `project_id` index or a
/// sequential scan, so the seed puts 20,000 issues in the scrum project.
#[sqlx::test]
async fn searching_a_rare_word_in_a_20000_issue_project_uses_the_summary_trigram_index(
    pool: PgPool,
) {
    let size = SeedSize {
        issues: 25_000,
        users: 5,
        sprints: 2,
    };
    seed::seed(&pool, &size).await.unwrap();
    sqlx::query("ANALYZE issue").execute(&pool).await.unwrap();
    let project_id: i64 = sqlx::query_scalar("SELECT id FROM project WHERE key = $1")
        .bind(seed::SCRUM_KEY)
        .fetch_one(&pool)
        .await
        .unwrap();

    let words = plan(&pool, project_id, "%quokka%", None).await;
    let key = plan(&pool, project_id, "%PERF-12%", Some(12)).await;

    assert!(words.contains("issue_summary_trgm_idx"), "{words}");
    assert!(key.contains("issue_summary_trgm_idx"), "{key}");
}
