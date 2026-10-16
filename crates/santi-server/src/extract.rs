use axum::extract::{FromRequest, FromRequestParts};

use crate::error::AppError;

/// JSON request body; a malformed body answers with problem+json (D24).
#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(AppError))]
pub struct JsonBody<T>(pub T);

/// Path parameters; an unparsable segment answers with problem+json (D24).
#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Path), rejection(AppError))]
pub struct PathParams<T>(pub T);
