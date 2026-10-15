use axum::Json;
use axum::extract::rejection::{JsonRejection, PathRejection};
use axum::http::{StatusCode, header::CONTENT_TYPE};
use axum::response::{IntoResponse, Response};
use santi_types::{FieldError, Problem};

#[derive(Debug, PartialEq)]
pub enum AppError {
    BadRequest(String),
    Validation(Vec<FieldError>),
    Unauthorized,
    Forbidden,
    NotFound,
    Conflict { slug: &'static str, detail: String },
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
            AppError::Unauthorized => (
                401,
                "unauthorized",
                "Not signed in",
                "Sign in or send a valid API token.".into(),
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
            AppError::Internal(_) => (
                500,
                "internal",
                "Internal error",
                "Something went wrong on the server.".into(),
            ),
        };
        let errors = match self {
            AppError::Validation(errors) => errors.clone(),
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

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        if let AppError::Internal(message) = &self {
            eprintln!("internal error: {message}");
        }
        let problem = self.to_problem();
        let status =
            StatusCode::from_u16(problem.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        (
            status,
            [(CONTENT_TYPE, "application/problem+json")],
            Json(problem),
        )
            .into_response()
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
        AppError::Internal(error.to_string())
    }
}

impl From<JsonRejection> for AppError {
    fn from(rejection: JsonRejection) -> Self {
        AppError::BadRequest(rejection.body_text())
    }
}

impl From<PathRejection> for AppError {
    fn from(rejection: PathRejection) -> Self {
        AppError::BadRequest(rejection.body_text())
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
    fn row_not_found_becomes_not_found() {
        assert_eq!(AppError::from(sqlx::Error::RowNotFound), AppError::NotFound);
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
    }
}
