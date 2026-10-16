use std::process::ExitCode;

use clap::Parser;

#[tokio::main]
async fn main() -> ExitCode {
    match santi_cli::run(santi_cli::Cli::parse()).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("santi: {error}");
            ExitCode::from(error.exit_code())
        }
    }
}
