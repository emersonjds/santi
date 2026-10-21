#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // SAN-209
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    let json = std::env::var("SANTI_LOG_FORMAT").as_deref() != Ok("pretty");
    tracing::subscriber::set_global_default(santi_server::observability::subscriber(
        filter,
        json,
        std::io::stdout,
    ))?;
    let database_url = std::env::var("DATABASE_URL")?;
    let address = std::env::var("SANTI_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let web_dir = std::env::var("SANTI_WEB_DIR").unwrap_or_else(|_| "web/dist".into());
    // D39
    let cores = std::thread::available_parallelism().map_or(4, usize::from) as u32;
    let pool_size = match std::env::var("SANTI_DB_POOL") {
        Ok(size) => size.parse()?,
        Err(_) => (cores * 2).clamp(10, 50),
    };
    // SAN-213
    let (timeouts, warnings) = santi_server::timeouts::from_env(|name| std::env::var(name).ok());
    for warning in warnings {
        tracing::warn!("{warning}");
    }
    let pool = santi_server::timeouts::pool(database_url.parse()?, pool_size, &timeouts);
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
    // D53
    let storage_config = santi_server::storage::StorageConfig::from_env()?;
    for warning in
        storage_config.startup_warnings(std::env::var_os("RAILWAY_ENVIRONMENT").is_some())
    {
        tracing::warn!("{warning}");
    }
    let storage = santi_server::storage::Storage::new(&storage_config)?;
    // D45 and OR-58: purge.
    let purge_pool = pool.clone();
    let purge_storage = storage.clone();
    tokio::spawn(async move {
        let mut hourly = tokio::time::interval(std::time::Duration::from_secs(60 * 60));
        loop {
            hourly.tick().await;
            match santi_server::purge_expired(&purge_pool).await {
                Ok((sessions, invites)) => tracing::info!(sessions, invites, "purge done"),
                Err(error) => tracing::error!(%error, "purge failed"),
            }
            match santi_server::purge_trash(&purge_pool, &purge_storage).await {
                Ok(projects) => tracing::info!(projects, "trash purge done"),
                Err(error) => tracing::error!(%error, "trash purge failed"),
            }
            match santi_server::purge_notifications(&purge_pool).await {
                Ok(notifications) => tracing::info!(notifications, "notification purge done"),
                Err(error) => tracing::error!(%error, "notification purge failed"),
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
                storage,
                request_timeout: timeouts.request,
            },
            Some(std::path::Path::new(&web_dir)),
        )
        .into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;
    Ok(())
}
