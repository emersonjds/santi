//! `cargo run -p santi-server --bin seed -- --issues 5000 --users 50 --sprints 20` into an empty database.
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let size = santi_server::seed::SeedSize::from_args(&args)?;
    let pool = sqlx::PgPool::connect(&std::env::var("DATABASE_URL")?).await?;
    santi_server::migrate(&pool).await?;
    santi_server::seed::seed(&pool, &size)
        .await
        .map_err(|error| format!("{error:?}"))?;
    println!(
        "seeded {size:?}: projects {} and {}, sign in as {} / {}",
        santi_server::seed::SCRUM_KEY,
        santi_server::seed::KANBAN_KEY,
        santi_server::seed::OWNER_EMAIL,
        santi_server::seed::PASSWORD
    );
    Ok(())
}
