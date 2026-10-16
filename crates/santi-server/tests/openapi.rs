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

#[test]
fn every_operation_with_a_body_documents_its_422() {
    let spec = serde_json::to_value(santi_server::openapi()).unwrap();
    let mut undocumented = Vec::new();
    for (path, operations) in spec["paths"].as_object().unwrap() {
        for (method, operation) in operations.as_object().unwrap() {
            if operation.get("requestBody").is_some() && operation["responses"].get("422").is_none()
            {
                undocumented.push(format!("{method} {path}"));
            }
        }
    }
    assert!(undocumented.is_empty(), "{undocumented:?}");
}
