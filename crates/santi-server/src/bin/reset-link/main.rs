//! `reset-link <email>`: prints a one-time password reset link for that account (SAN-171).
use std::env::var;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [email] = args.as_slice() else {
        return Err("usage: reset-link <email>".into());
    };
    let base_url = santi_server::auth::domain::public_url(
        var("SANTI_PUBLIC_URL").ok(),
        var("RAILWAY_PUBLIC_DOMAIN").ok(),
    );
    let pool = sqlx::PgPool::connect(&var("DATABASE_URL")?).await?;
    match santi_server::auth::service::reset_link_output(&pool, email, &base_url).await {
        Ok(output) => println!("{output}"),
        Err(reason) => {
            eprintln!("{reason}");
            std::process::exit(1);
        }
    }
    Ok(())
}
