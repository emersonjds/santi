#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let database_url = std::env::var("DATABASE_URL")?;
    let address = std::env::var("SANTI_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let web_dir = std::env::var("SANTI_WEB_DIR").unwrap_or_else(|_| "web/dist".into());
    // D39
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
    // D44: Railway's edge is one proxy appending to X-Forwarded-For; locally there is none.
    let trusted_proxies = match std::env::var("SANTI_TRUSTED_PROXIES") {
        Ok(count) => count.parse()?,
        Err(_) => usize::from(std::env::var_os("RAILWAY_PROJECT_ID").is_some()),
    };
    let per_address = std::env::var("SANTI_IP_LIMITS").as_deref() != Ok("off");
    let limits = std::sync::Arc::new(santi_server::rate_limit::RateLimits::new(
        trusted_proxies,
        per_address,
    ));
    // D44
    let prune_limits = limits.clone();
    tokio::spawn(async move {
        let mut every_minute = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            every_minute.tick().await;
            prune_limits.prune();
        }
    });
    // D45
    let legal_pages = std::env::var("SANTI_LEGAL_PAGES").as_deref() != Ok("off");
    let legal = santi_server::Legal::from_web_dir(legal_pages, std::path::Path::new(&web_dir));
    // D45: purge.
    let purge_pool = pool.clone();
    tokio::spawn(async move {
        let mut hourly = tokio::time::interval(std::time::Duration::from_secs(60 * 60));
        loop {
            hourly.tick().await;
            if let Err(error) = santi_server::purge_expired(&purge_pool).await {
                eprintln!("purge failed: {error}");
            }
        }
    });
    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(
        listener,
        santi_server::app(
            santi_server::AppState {
                pool,
                limits,
                legal: std::sync::Arc::new(legal),
            },
            Some(std::path::Path::new(&web_dir)),
        )
        .into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;
    Ok(())
}
