use askama::Template;
use axum::Router;
use axum::extract::{Form, State};
use axum::http::StatusCode;
use axum::http::header::SET_COOKIE;
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use santi_types::FieldError;
use santi_types::auth::{Login, Register};

use super::{domain, service};
use crate::AppState;
use crate::error::AppError;
use crate::web::{PageUser, render};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", get(login_page).post(login))
        .route("/register", get(register_page).post(register))
        .route("/logout", post(logout))
}

#[derive(Template, Default)]
#[template(path = "app/login.html")]
struct LoginPage {
    email: String,
    failed: bool,
}

#[derive(Template, Default)]
#[template(path = "app/register.html")]
struct RegisterPage {
    email: String,
    display_name: String,
    errors: Vec<FieldError>,
}

impl RegisterPage {
    fn error(&self, field: &str) -> &str {
        self.errors
            .iter()
            .find(|error| error.field == field)
            .map_or("", |error| error.message.as_str())
    }
}

async fn login_page() -> Result<Response, AppError> {
    render(StatusCode::OK, &LoginPage::default())
}

async fn register_page() -> Result<Response, AppError> {
    render(StatusCode::OK, &RegisterPage::default())
}

/// Keeps the typed email; the password is never echoed back.
async fn login(
    State(state): State<AppState>,
    Form(input): Form<Login>,
) -> Result<Response, AppError> {
    let email = input.email.clone();
    match service::login(&state.pool, input).await {
        Ok((_, session)) => Ok(signed_in(&session)),
        Err(AppError::Unauthorized) => render(
            StatusCode::UNAUTHORIZED,
            &LoginPage {
                email,
                failed: true,
            },
        ),
        Err(error) => Err(error),
    }
}

async fn register(
    State(state): State<AppState>,
    Form(input): Form<Register>,
) -> Result<Response, AppError> {
    let mut page = RegisterPage {
        email: input.email.clone(),
        display_name: input.display_name.clone(),
        errors: Vec::new(),
    };
    let status = match service::register(&state.pool, input).await {
        Ok((_, session)) => return Ok(signed_in(&session)),
        Err(AppError::Validation(errors)) => {
            page.errors = errors;
            StatusCode::UNPROCESSABLE_ENTITY
        }
        Err(AppError::Conflict { .. }) => {
            page.errors = vec![FieldError {
                field: "email".into(),
                message: "already has an account".into(),
            }];
            StatusCode::CONFLICT
        }
        Err(error) => return Err(error),
    };
    render(status, &page)
}

async fn logout(
    State(state): State<AppState>,
    PageUser(user): PageUser,
) -> Result<Response, AppError> {
    service::logout(&state.pool, &user).await?;
    let cookie = domain::expired_session_cookie();
    Ok(([(SET_COOKIE, cookie)], Redirect::to("/login")).into_response())
}

fn signed_in(session: &str) -> Response {
    let cookie = domain::session_cookie(session);
    ([(SET_COOKIE, cookie)], Redirect::to("/")).into_response()
}
