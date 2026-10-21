use axum::Json;
use axum::extract::rejection::{JsonRejection, PathRejection};
use axum::http::StatusCode;
use axum::http::header::{CONTENT_TYPE, RETRY_AFTER};
use axum::response::{IntoResponse, Response};
use santi_types::{FieldError, Problem};

#[derive(Debug, PartialEq)]
pub enum AppError {
    BadRequest(String),
    Validation(Vec<FieldError>),
    /// Valid JSON of the wrong shape: serde's reason is the detail too.
    WrongShape(FieldError),
    Unauthorized,
    /// Wrong email or password at sign-in; same answer for unknown accounts.
    InvalidCredentials,
    Forbidden,
    NotFound,
    Conflict {
        slug: &'static str,
        detail: String,
    },
    Gone {
        slug: &'static str,
        detail: String,
    },
    PayloadTooLarge,
    /// D44: answered with `Retry-After` in seconds.
    TooManyRequests {
        retry_after: u64,
    },
    Internal(String),
}

impl AppError {
    pub fn invalid(field: &str, message: &str) -> Self {
        AppError::Validation(vec![FieldError {
            field: field.into(),
            message: message.into(),
        }])
    }

    pub fn conflict(slug: &'static str, detail: &str) -> Self {
        AppError::Conflict {
            slug,
            detail: detail.into(),
        }
    }

    pub fn gone(slug: &'static str, detail: &str) -> Self {
        AppError::Gone {
            slug,
            detail: detail.into(),
        }
    }

    pub fn to_problem(&self) -> Problem {
        let (status, slug, title, detail) = match self {
            AppError::BadRequest(detail) => {
                (400, "bad-request", "Malformed request", detail.clone())
            }
            AppError::Validation(_) => (
                422,
                "validation",
                "Invalid input",
                "One or more fields are invalid.".into(),
            ),
            AppError::WrongShape(error) => {
                (422, "validation", "Invalid input", error.message.clone())
            }
            AppError::Unauthorized => (
                401,
                "unauthorized",
                "Not signed in",
                "Sign in or send a valid API token.".into(),
            ),
            AppError::InvalidCredentials => (
                401,
                "invalid-credentials",
                "Sign-in failed",
                "Email or password is incorrect.".into(),
            ),
            AppError::Forbidden => (
                403,
                "forbidden",
                "Not allowed",
                "You are not allowed to do this.".into(),
            ),
            AppError::NotFound => (
                404,
                "not-found",
                "Not found",
                "Nothing exists here, or you cannot see it.".into(),
            ),
            AppError::Conflict { slug, detail } => (409, *slug, "Conflict", detail.clone()),
            AppError::Gone { slug, detail } => (410, *slug, "Gone", detail.clone()),
            AppError::PayloadTooLarge => (
                413,
                "payload-too-large",
                "Request too large",
                "The request body is larger than this route accepts.".into(),
            ),
            AppError::TooManyRequests { retry_after } => (
                429,
                "rate-limited",
                "Too many requests",
                format!("Too many attempts. Try again in {retry_after} seconds."),
            ),
            AppError::Internal(_) => (
                500,
                "internal",
                "Internal error",
                "Something went wrong on the server.".into(),
            ),
        };
        let errors = match self {
            AppError::Validation(errors) => errors.clone(),
            AppError::WrongShape(error) => vec![error.clone()],
            _ => Vec::new(),
        };
        Problem {
            problem_type: format!("urn:santi:error:{slug}"),
            title: title.into(),
            status,
            detail,
            errors,
        }
    }
}

/// PostgreSQL text cannot store U+0000; a value holding it is refused before it reaches the database.
pub fn reject_nul(field: &str, text: &str) -> Result<(), AppError> {
    if text.contains('\0') {
        return Err(AppError::invalid(field, "must not contain NUL characters"));
    }
    Ok(())
}

/// For an insert under a row read earlier: a foreign key failure means that row was deleted
/// meanwhile, so there is nothing left to write under.
pub fn not_found_if_parent_gone(error: sqlx::Error) -> AppError {
    let parent_gone = error
        .as_database_error()
        .is_some_and(|error| error.is_foreign_key_violation());
    if parent_gone {
        return AppError::NotFound;
    }
    error.into()
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        if let AppError::Internal(message) = &self {
            tracing::error!(%message, "internal error");
        }
        let problem = self.to_problem();
        let status =
            StatusCode::from_u16(problem.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        let mut response = (
            status,
            [(CONTENT_TYPE, "application/problem+json")],
            Json(problem),
        )
            .into_response();
        if let AppError::TooManyRequests { retry_after } = self {
            response
                .headers_mut()
                .insert(RETRY_AFTER, retry_after.into());
        }
        response
    }
}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        if matches!(error, sqlx::Error::RowNotFound) {
            return AppError::NotFound;
        }
        let Some(database_error) = error.as_database_error() else {
            return AppError::Internal(error.to_string());
        };
        if database_error.is_unique_violation() {
            return AppError::conflict(
                "already-exists",
                "A record with these values already exists.",
            );
        }
        if database_error.is_foreign_key_violation() {
            return AppError::conflict("in-use", "Other records still point to this one.");
        }
        if database_error.is_check_violation() {
            return AppError::invalid(
                database_error.constraint().unwrap_or("input"),
                "value is not allowed",
            );
        }
        if database_error.code().as_deref() == Some(UNTRANSLATABLE_CHARACTER) {
            return AppError::invalid("input", "must not contain NUL characters");
        }
        AppError::Internal(error.to_string())
    }
}

/// SQLSTATE 22021, raised for a NUL character in text.
const UNTRANSLATABLE_CHARACTER: &str = "22021";

/// Broken syntax or a wrong content type; valid JSON of the wrong shape goes through [`wrong_shape`].
impl From<JsonRejection> for AppError {
    fn from(rejection: JsonRejection) -> Self {
        AppError::BadRequest(rejection.body_text())
    }
}

/// Valid JSON of the wrong shape (an unknown field, a wrong type) is a 422 naming the problem.
/// serde names the Rust type a non-object body should have been.
pub(crate) fn wrong_shape(text: &str) -> AppError {
    let mut reason = text.to_string();
    for rust_type in ["expected struct ", "expected internally tagged enum "] {
        if let Some((before, after)) = reason.split_once(rust_type) {
            let rest = after.split_once(' ').map_or("", |(_, rest)| rest);
            reason = format!("{before}expected a JSON object {rest}")
                .trim_end()
                .to_string();
        }
    }
    let field = ["unknown field `", "missing field `"]
        .iter()
        .find_map(|marker| reason.split_once(marker)?.1.split_once('`'))
        .map(|(name, _)| name)
        // serde_path_to_error prefixes a bad value with its path: "ids[1]: invalid type".
        .or_else(|| {
            let (path, _) = reason.split_once(": ")?;
            let key = path.split(['.', '[']).next()?;
            (!key.is_empty() && !key.contains(' ')).then_some(key)
        })
        .unwrap_or("body")
        .to_string();
    AppError::WrongShape(FieldError {
        field,
        message: reason,
    })
}

impl From<PathRejection> for AppError {
    fn from(rejection: PathRejection) -> Self {
        AppError::BadRequest(rejection.body_text())
    }
}

impl From<axum::extract::multipart::MultipartRejection> for AppError {
    fn from(_: axum::extract::multipart::MultipartRejection) -> Self {
        AppError::invalid("file", "send the file as multipart/form-data")
    }
}

impl From<axum_extra::extract::QueryRejection> for AppError {
    fn from(rejection: axum_extra::extract::QueryRejection) -> Self {
        AppError::BadRequest(rejection.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::AppError;
    use axum::http::{StatusCode, header};
    use axum::response::IntoResponse;
    use sqlx::PgPool;

    #[test]
    fn validation_lists_field_errors_with_422() {
        let problem = AppError::invalid("email", "must be an email address").to_problem();

        assert_eq!(problem.status, 422);
        assert_eq!(problem.problem_type, "urn:santi:error:validation");
        assert_eq!(problem.errors[0].field, "email");
    }

    #[test]
    fn conflict_puts_its_slug_in_the_type() {
        let problem = AppError::conflict("sprint-empty", "Add an issue first.").to_problem();

        assert_eq!(problem.status, 409);
        assert_eq!(problem.problem_type, "urn:santi:error:sprint-empty");
        assert_eq!(problem.detail, "Add an issue first.");
    }

    #[test]
    fn internal_error_hides_its_message() {
        let problem = AppError::Internal("password=hunter2".into()).to_problem();

        assert_eq!(problem.status, 500);
        assert!(!problem.detail.contains("hunter2"));
    }

    #[test]
    fn every_status_maps_to_its_code() {
        assert_eq!(AppError::BadRequest("x".into()).to_problem().status, 400);
        assert_eq!(AppError::Unauthorized.to_problem().status, 401);
        assert_eq!(AppError::Forbidden.to_problem().status, 403);
        assert_eq!(AppError::NotFound.to_problem().status, 404);
    }

    #[test]
    fn response_uses_problem_content_type() {
        let response = AppError::NotFound.into_response();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "application/problem+json"
        );
    }

    #[test]
    fn internal_error_response_is_500() {
        let response = AppError::Internal("boom".into()).into_response();

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn a_wrong_shape_names_only_the_top_level_key() {
        for (text, field) in [
            (
                "parent.child: invalid type: integer `5`, expected a string",
                "parent",
            ),
            ("ids[1]: invalid type: string \"x\", expected i64", "ids"),
            (
                "m.<b>evil</b>: invalid type: integer `5`, expected a string",
                "m",
            ),
            ("m.a b: invalid type: integer `5`, expected a string", "m"),
            ("[0]: invalid type: integer `5`, expected a string", "body"),
            ("theme: unknown variant `blue`, expected `light`", "theme"),
        ] {
            let AppError::WrongShape(error) = super::wrong_shape(text) else {
                panic!("{text}");
            };
            assert_eq!(error.field, field, "{text}");
        }
    }

    #[test]
    fn row_not_found_becomes_not_found() {
        assert_eq!(AppError::from(sqlx::Error::RowNotFound), AppError::NotFound);
    }

    #[test]
    fn non_database_error_becomes_internal() {
        let problem = AppError::from(sqlx::Error::PoolTimedOut).to_problem();

        assert_eq!(problem.status, 500);
    }

    #[sqlx::test(migrations = false)]
    async fn database_constraint_errors_are_mapped(pool: PgPool) {
        sqlx::query("CREATE TABLE sample (id int PRIMARY KEY, amount int CHECK (amount > 0), parent int REFERENCES sample (id))")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO sample (id, amount) VALUES (1, 5)")
            .execute(&pool)
            .await
            .unwrap();

        let duplicate = sqlx::query("INSERT INTO sample (id, amount) VALUES (1, 5)")
            .execute(&pool)
            .await
            .unwrap_err();
        let negative = sqlx::query("INSERT INTO sample (id, amount) VALUES (2, -1)")
            .execute(&pool)
            .await
            .unwrap_err();
        let orphan = sqlx::query("INSERT INTO sample (id, amount, parent) VALUES (3, 1, 99)")
            .execute(&pool)
            .await
            .unwrap_err();
        let syntax = sqlx::query("SELEC 1").execute(&pool).await.unwrap_err();
        let nul = sqlx::query("SELECT $1::text")
            .bind("a\0b")
            .execute(&pool)
            .await
            .unwrap_err();

        assert_eq!(
            AppError::from(duplicate).to_problem().problem_type,
            "urn:santi:error:already-exists"
        );
        assert_eq!(AppError::from(negative).to_problem().status, 422);
        assert_eq!(
            AppError::from(orphan).to_problem().problem_type,
            "urn:santi:error:in-use"
        );
        assert_eq!(AppError::from(syntax).to_problem().status, 500);
        assert_eq!(AppError::from(nul).to_problem().status, 422);
    }
}
