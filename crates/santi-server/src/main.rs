#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let database_url = std::env::var("DATABASE_URL")?;
    let address = std::env::var("SANTI_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let web_dir = std::env::var("SANTI_WEB_DIR").unwrap_or_else(|_| "web/dist".into());
    let pool = sqlx::PgPool::connect(&database_url).await?;
    santi_server::migrate(&pool).await?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(
        listener,
        santi_server::app(
            santi_server::AppState { pool },
            Some(std::path::Path::new(&web_dir)),
        ),
    )
    .await?;
    Ok(())
}
