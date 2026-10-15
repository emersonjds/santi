use clap::Parser;

#[derive(Debug, Parser)]
#[command(
    name = "santi",
    version,
    about = "Agile tracker: boards, backlog and sprints"
)]
pub struct Cli {}
