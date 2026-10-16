use std::path::Path;

#[test]
fn committed_openapi_snapshot_matches_the_server() {
    let snapshot = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../web/openapi.json");
    let spec = santi_server::openapi().to_pretty_json().unwrap() + "\n";
    if std::env::var_os("UPDATE_OPENAPI").is_some() {
        std::fs::write(&snapshot, &spec).unwrap();
    }
    let committed = std::fs::read_to_string(&snapshot).unwrap_or_default();
    assert!(
        committed == spec,
        "web/openapi.json is stale: run `UPDATE_OPENAPI=1 cargo test -p santi-server --test openapi`"
    );
}
