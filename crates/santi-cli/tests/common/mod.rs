#![allow(dead_code)]

use std::str::FromStr;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicUsize, Ordering};

use serde_json::{Value, json};
use sqlx::postgres::{PgConnectOptions, PgPool};
use sqlx::{AssertSqlSafe, Executor};
use tokio::runtime::Runtime;

/// The real santi server, in this process, on its own runtime and database, shared by the
/// tests of one test binary. The `santi` binary under test is a separate process that talks to it.
pub struct Server {
    pub url: String,
    runtime: Runtime,
}

pub fn server() -> &'static Server {
    static SERVER: OnceLock<Server> = OnceLock::new();
    SERVER.get_or_init(start)
}

fn start() -> Server {
    let runtime = Runtime::new().unwrap();
    let url = runtime.block_on(async {
        let base = std::env::var("DATABASE_URL").expect("DATABASE_URL points at PostgreSQL");
        let base = PgConnectOptions::from_str(&base).unwrap();
        let admin = PgPool::connect_with(base.clone()).await.unwrap();
        // A database still in use by a concurrent run refuses the DROP and is kept.
        let leftovers: Vec<String> = sqlx::query_scalar(
            "SELECT datname FROM pg_database WHERE datname LIKE 'santi\\_cli\\_test\\_%'",
        )
        .fetch_all(&admin)
        .await
        .unwrap();
        for database in leftovers {
            let drop = format!("DROP DATABASE IF EXISTS {database}");
            admin.execute(AssertSqlSafe(drop)).await.ok();
        }
        let name = format!(
            "santi_cli_test_{}_{}",
            env!("CARGO_CRATE_NAME"),
            std::process::id()
        );
        let create = format!("CREATE DATABASE {name}");
        admin.execute(AssertSqlSafe(create)).await.unwrap();
        let pool = PgPool::connect_with(base.database(&name)).await.unwrap();
        santi_server::migrate(&pool).await.unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let app = santi_server::app(santi_server::AppState::new(pool), None);
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        format!("http://{address}")
    });
    Server { url, runtime }
}

impl Server {
    pub fn block_on<F: Future>(&self, future: F) -> F::Output {
        self.runtime.block_on(future)
    }

    /// Registers a new user and returns a fresh API token for it.
    pub fn user(&self) -> String {
        static COUNT: AtomicUsize = AtomicUsize::new(0);
        let email = format!("user{}@example.com", COUNT.fetch_add(1, Ordering::Relaxed));
        self.block_on(async {
            let http = reqwest::Client::new();
            let register = json!({ "email": email, "password": "correct horse battery", "display_name": email, "accept_terms": true, "confirm_age": true });
            let response = http
                .post(format!("{}/api/auth/register", self.url))
                .json(&register)
                .send()
                .await
                .unwrap();
            let cookie = response.headers()["set-cookie"].to_str().unwrap();
            let cookie = cookie.split(';').next().unwrap().to_string();
            let created: Value = http
                .post(format!("{}/api/tokens", self.url))
                .header("cookie", cookie)
                .json(&json!({ "name": "tests" }))
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            created["token"].as_str().unwrap().to_string()
        })
    }

    pub fn project(&self, token: &str, key: &str, board_type: &str) {
        let body =
            json!({ "key": key, "name": format!("Project {key}"), "board_type": board_type });
        self.block_on(async {
            let status = reqwest::Client::new()
                .post(format!("{}/api/projects", self.url))
                .bearer_auth(token)
                .json(&body)
                .send()
                .await
                .unwrap()
                .status();
            assert_eq!(status, 201);
        });
    }

    /// Adds the user behind `member` to project `key` as a plain member.
    pub fn member(&self, admin: &str, key: &str, member: &str) {
        let email = self.get(member, "/api/me")["email"].clone();
        let body = json!({ "email": email, "role": "member" });
        self.block_on(async {
            let status = reqwest::Client::new()
                .post(format!("{}/api/projects/{key}/members", self.url))
                .bearer_auth(admin)
                .json(&body)
                .send()
                .await
                .unwrap()
                .status();
            assert!(status.is_success(), "{status}");
        });
    }

    pub fn get(&self, token: &str, path: &str) -> Value {
        self.block_on(async {
            reqwest::Client::new()
                .get(format!("{}{path}", self.url))
                .bearer_auth(token)
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap()
        })
    }
}
