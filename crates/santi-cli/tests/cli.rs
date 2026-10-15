use clap::{CommandFactory, Parser, error::ErrorKind};
use santi_cli::Cli;

#[test]
fn command_definition_is_valid() {
    Cli::command().debug_assert();
}

#[test]
fn version_flag_prints_version() {
    let error = Cli::try_parse_from(["santi", "--version"]).unwrap_err();
    assert_eq!(error.kind(), ErrorKind::DisplayVersion);
}

#[test]
fn binary_is_named_santi() {
    assert_eq!(Cli::command().get_name(), "santi");
}
