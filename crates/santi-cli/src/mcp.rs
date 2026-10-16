use std::net::SocketAddr;

use crate::client::Client;
use crate::error::Error;

pub async fn serve_stdio(_client: Client) -> Result<(), Error> {
    Err(Error::Other("santi mcp is not built yet".into()))
}

pub async fn serve_http(
    _client: Client,
    _address: SocketAddr,
    _allowed_hosts: Vec<String>,
) -> Result<(), Error> {
    Err(Error::Other("santi mcp is not built yet".into()))
}
