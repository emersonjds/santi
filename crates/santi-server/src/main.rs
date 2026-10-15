#[tokio::main]
async fn main() -> std::io::Result<()> {
    let address = std::env::var("SANTI_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, santi_server::app()).await
}
