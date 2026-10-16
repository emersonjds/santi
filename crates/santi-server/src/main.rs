#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let database_url = std::env::var("DATABASE_URL")?;
    let address = std::env::var("SANTI_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let web_dir = std::env::var("SANTI_WEB_DIR").unwrap_or_else(|_| "web/dist".into());
    // D39: sqlx defaults to 10 connections, which caps throughput long before PostgreSQL does.
    let cores = std::thread::available_parallelism().map_or(4, usize::from) as u32;
    let pool_size = match std::env::var("SANTI_DB_POOL") {
        Ok(size) => size.parse()?,
        Err(_) => (cores * 2).clamp(10, 50),
    };
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(pool_size)
        .connect(&database_url)
        .await?;
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
