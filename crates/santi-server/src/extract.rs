use axum::extract::{FromRequest, FromRequestParts, Request};
use serde::de::DeserializeOwned;

use crate::error::{AppError, wrong_shape};

/// JSON request body; a malformed body answers with problem+json (D24).
pub struct JsonBody<T>(pub T);

/// Parsed to a `Value` first: serde_json reports some wrong types (`{"theme": 5}` for an enum)
/// as syntax errors when it reads the body straight into `T`.
impl<T: DeserializeOwned, S: Send + Sync> FromRequest<S> for JsonBody<T> {
    type Rejection = AppError;

    async fn from_request(request: Request, state: &S) -> Result<Self, AppError> {
        let axum::Json(value) =
            axum::Json::<serde_json::Value>::from_request(request, state).await?;
        serde_path_to_error::deserialize(value)
            .map(JsonBody)
            .map_err(|error| wrong_shape(&error.to_string()))
    }
}

/// Path parameters; an unparsable segment answers with problem+json (D24).
#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Path), rejection(AppError))]
pub struct PathParams<T>(pub T);

/// Query string with repeated keys collected into `Vec`s (`?type=bug&type=task`); errors as problem+json.
#[derive(FromRequestParts)]
#[from_request(via(axum_extra::extract::Query), rejection(AppError))]
pub struct QueryParams<T>(pub T);
