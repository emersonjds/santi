use chrono::{DateTime, Duration, SubsecRound, Utc};
use santi_types::auth::{
    AcceptLegal, AccountExport, ApiToken, CreateToken, CreatedToken, DeleteAccount, LegalDocuments,
    LegalStatus, Login, PasswordResetPreview, ProjectExport, Register, ResetPassword, UpdateMe,
    User,
};
use santi_types::issues::{Issue, IssueFilter, PageParams, StatusFilter};
use santi_types::projects::{MemberRole, Project, ProjectState};
use sqlx::{PgConnection, PgPool};

use super::extract::CurrentUser;
use super::{domain, repo};
use crate::Legal;
use crate::error::{AppError, reject_nul};
use crate::members::{self, Member};
use crate::storage::Storage;
use crate::{attachments, boards, home, issues, projects, sprints};

/// Creates the user and signs them in; returns the user and the session token.
pub async fn register(
    pool: &PgPool,
    legal: &Legal,
    input: Register,
) -> Result<(User, String), AppError> {
    let email = domain::normalize_email(&input.email)?;
    let display_name = domain::check_display_name(&input.display_name)?;
    domain::check_password(&input.password)?;
    if legal.required {
        domain::check_terms(input.accept_terms)?;
        domain::check_age(input.confirm_age)?;
    }
    let password_hash = hash_in_background(input.password).await?;
    let mut tx = pool.begin().await?;
    let user = repo::insert_user(&mut tx, &email, &display_name, &password_hash).await?;
    if legal.required {
        record_acceptance(&mut tx, legal, user.id).await?;
    }
    let session = start_session(&mut tx, user.id).await?;
    tx.commit().await?;
    Ok((user, session))
}

/// Unknown email and wrong password give the same error after the same argon2 work.
pub async fn login(pool: &PgPool, input: Login) -> Result<(User, String), AppError> {
    let email = input.email.trim().to_lowercase();
    let mut conn = pool.acquire().await?;
    let found = repo::find_user_by_email(&mut conn, &email).await?;
    let stored_hash = found
        .as_ref()
        .map_or_else(domain::dummy_password_hash, |user| {
            user.password_hash.clone()
        });
    let password_matches = verify_in_background(input.password, stored_hash).await?;
    let Some(user) = found.filter(|_| password_matches) else {
        return Err(AppError::InvalidCredentials);
    };
    repo::delete_expired_sessions(&mut conn, user.id).await?;
    let session = start_session(&mut conn, user.id).await?;
    let user = User {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        theme: user.theme,
        time_zone: user.time_zone,
    };
    Ok((user, session))
}

/// Revokes the session that made the request; other devices stay signed in.
pub async fn logout(pool: &PgPool, user: &CurrentUser) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    repo::delete_session(&mut conn, user.token_id).await?;
    Ok(())
}

pub async fn me(pool: &PgPool, user: &CurrentUser) -> Result<User, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::find_user(&mut conn, user.id).await?)
}

pub async fn update_me(
    pool: &PgPool,
    user: &CurrentUser,
    input: UpdateMe,
) -> Result<User, AppError> {
    let display_name = input
        .display_name
        .as_deref()
        .map(domain::check_display_name)
        .transpose()?;
    let time_zone = match input.time_zone {
        Some(Some(zone)) => Some(Some(domain::check_time_zone(&zone)?)),
        Some(None) => Some(None),
        None => None,
    };
    let mut conn = pool.acquire().await?;
    Ok(repo::update_user(
        &mut conn,
        user.id,
        display_name.as_deref(),
        input.theme,
        time_zone.as_ref().map(Option::as_deref),
    )
    .await?)
}

pub async fn create_token(
    pool: &PgPool,
    user: &CurrentUser,
    input: CreateToken,
) -> Result<CreatedToken, AppError> {
    reject_nul("name", &input.name)?;
    let name = input.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::invalid("name", "must have 1 to 100 characters"));
    }
    let token = domain::new_api_token();
    let mut conn = pool.acquire().await?;
    let id = repo::insert_api_token(&mut conn, user.id, &name, &domain::hash_token(&token)).await?;
    Ok(CreatedToken { id, name, token })
}

pub async fn list_tokens(pool: &PgPool, user: &CurrentUser) -> Result<Vec<ApiToken>, AppError> {
    let mut conn = pool.acquire().await?;
    Ok(repo::list_api_tokens(&mut conn, user.id).await?)
}

pub async fn delete_token(
    pool: &PgPool,
    user: &CurrentUser,
    token_id: i64,
) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let deleted = repo::delete_api_token(&mut conn, user.id, token_id).await?;
    if !deleted {
        return Err(AppError::NotFound);
    }
    Ok(())
}

/// D45: the account, its token names, every project the caller administers, in full, and the home data.
pub async fn export_account(pool: &PgPool, user: &CurrentUser) -> Result<AccountExport, AppError> {
    let mut conn = pool.acquire().await?;
    let me = repo::find_user(&mut conn, user.id).await?;
    let legal_acceptances = repo::list_acceptances(&mut conn, user.id).await?;
    let invite_uses = repo::list_invite_uses(&mut conn, user.id).await?;
    let api_tokens = repo::list_api_tokens(&mut conn, user.id).await?;
    let (admin, other_projects): (Vec<Project>, Vec<Project>) =
        projects::repo::list_projects(&mut conn, user.id, None)
            .await?
            .into_iter()
            .partition(|project| project.role == MemberRole::Admin);
    let other_projects = other_projects
        .into_iter()
        .filter(|project| project.state == ProjectState::Active)
        .collect();
    let mut exports = Vec::with_capacity(admin.len());
    for project in admin {
        let member = members::repo::find_member(&mut conn, &project.key, user.id)
            .await?
            .ok_or(AppError::NotFound)?;
        let comments = issues::repo::list_project_comments(&mut conn, member.project_id).await?;
        exports.push(ProjectExport {
            members: members::service::list_members(pool, &member).await?,
            board: boards::service::get_settings(pool, &member).await?,
            sprints: sprints::service::list_sprints(pool, &member).await?,
            issues: all_issues(pool, &member).await?,
            comments,
            project,
        });
    }
    Ok(AccountExport {
        exported_at: Utc::now(),
        user: me,
        legal_acceptances,
        invite_uses,
        api_tokens,
        projects: exports,
        other_projects,
        home: home::service::export(pool, user.id).await?,
    })
}

async fn all_issues(pool: &PgPool, member: &Member) -> Result<Vec<Issue>, AppError> {
    let mut issues = Vec::new();
    let mut cursor = None;
    loop {
        let page = PageParams {
            limit: Some(200),
            cursor,
        };
        let found = issues::service::search_issues(
            pool,
            member,
            IssueFilter::default(),
            StatusFilter::default(),
            page,
        )
        .await?;
        issues.extend(found.items);
        cursor = found.next_cursor;
        if cursor.is_none() {
            return Ok(issues);
        }
    }
}

/// D45: checks the password, then deletes the account in one transaction (see `repo::erase_user`);
/// the stored attachments of the projects that went with it are removed after the commit (D53).
pub async fn delete_account(
    pool: &PgPool,
    storage: &Storage,
    user: &CurrentUser,
    input: DeleteAccount,
) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let stored_hash = repo::find_password_hash(&mut conn, user.id).await?;
    drop(conn);
    if !verify_in_background(input.password, stored_hash).await? {
        return Err(AppError::invalid(
            "password",
            "does not match your password",
        ));
    }
    let mut tx = pool.begin().await?;
    repo::lock_memberships(&mut tx, user.id).await?;
    let keys = repo::delete_solo_projects(&mut tx, user.id).await?;
    repo::hand_over_admin(&mut tx, user.id).await?;
    repo::erase_user(&mut tx, user.id).await?;
    tx.commit().await?;
    attachments::service::delete_objects(storage, &keys).await;
    Ok(())
}

/// SAN-171: the operator's reset link for an account (any email case); `None` when no account
/// uses it. Returns the token and when it expires.
pub async fn create_password_reset(
    pool: &PgPool,
    email: &str,
) -> Result<Option<(String, DateTime<Utc>)>, AppError> {
    let email = email.trim().to_lowercase();
    let mut conn = pool.acquire().await?;
    let Some(user) = repo::find_user_by_email(&mut conn, &email).await? else {
        return Ok(None);
    };
    let token = domain::new_secret();
    let expires_at = (Utc::now() + Duration::hours(domain::RESET_HOURS)).trunc_subsecs(6);
    repo::upsert_password_reset(&mut conn, user.id, &domain::hash_token(&token), expires_at)
        .await?;
    Ok(Some((token, expires_at)))
}

/// What `reset-link <email>` prints: the link, then when it expires; or why there is none.
pub async fn reset_link_output(
    pool: &PgPool,
    email: &str,
    base_url: &str,
) -> Result<String, String> {
    match create_password_reset(pool, email).await {
        Ok(Some((token, expires_at))) => Ok(format!(
            "{}\nexpires {}",
            domain::reset_url(base_url, &token),
            expires_at.format("%Y-%m-%d %H:%M UTC")
        )),
        Ok(None) => Err("no account with that email".into()),
        Err(error) => Err(format!("{error:?}")),
    }
}

/// Unknown, used and expired links are the same 404.
pub async fn preview_password_reset(
    pool: &PgPool,
    token: &str,
) -> Result<PasswordResetPreview, AppError> {
    let mut conn = pool.acquire().await?;
    repo::find_password_reset(&mut conn, &domain::hash_token(token))
        .await?
        .ok_or(AppError::NotFound)
}

/// Sets the new password, ends every session of the account and signs in on a new one.
pub async fn reset_password(
    pool: &PgPool,
    token: &str,
    input: ResetPassword,
) -> Result<(User, String), AppError> {
    domain::check_password(&input.password)?;
    let mut tx = pool.begin().await?;
    let user_id = repo::take_password_reset(&mut tx, &domain::hash_token(token))
        .await?
        .ok_or(AppError::NotFound)?;
    let password_hash = hash_in_background(input.password).await?;
    repo::set_password_hash(&mut tx, user_id, &password_hash).await?;
    repo::delete_sessions(&mut tx, user_id).await?;
    let session = start_session(&mut tx, user_id).await?;
    let user = repo::find_user(&mut tx, user_id).await?;
    tx.commit().await?;
    Ok((user, session))
}

pub fn legal_documents(legal: &Legal) -> LegalDocuments {
    LegalDocuments {
        required: legal.required,
        terms_version: domain::TERMS_VERSION.into(),
        privacy_version: domain::PRIVACY_VERSION.into(),
    }
}

pub async fn legal_status(
    pool: &PgPool,
    legal: &Legal,
    user: &CurrentUser,
) -> Result<LegalStatus, AppError> {
    let accepted = !legal.required || {
        let mut conn = pool.acquire().await?;
        repo::has_current_acceptance(&mut conn, user.id).await?
    };
    let documents = legal_documents(legal);
    Ok(LegalStatus {
        required: documents.required,
        terms_version: documents.terms_version,
        privacy_version: documents.privacy_version,
        accepted,
    })
}

/// Accepts the current versions, e.g. after they changed (D45). Records nothing when they are
/// already accepted or the instance does not require them.
pub async fn accept_legal(
    pool: &PgPool,
    legal: &Legal,
    user: &CurrentUser,
    input: AcceptLegal,
) -> Result<LegalStatus, AppError> {
    domain::check_terms(input.accept_terms)?;
    domain::check_age(input.confirm_age)?;
    let status = legal_status(pool, legal, user).await?;
    if status.accepted {
        return Ok(status);
    }
    let mut conn = pool.acquire().await?;
    record_acceptance(&mut conn, legal, user.id).await?;
    Ok(LegalStatus {
        accepted: true,
        ..status
    })
}

/// New API tokens and joining a project need the current documents accepted; existing tokens
/// and sessions keep working (D45).
pub async fn require_current_acceptance(
    pool: &PgPool,
    legal: &Legal,
    user: &CurrentUser,
) -> Result<(), AppError> {
    if legal_status(pool, legal, user).await?.accepted {
        return Ok(());
    }
    Err(AppError::conflict(
        "terms-not-accepted",
        "Accept the current Terms of Use and Privacy Policy first.",
    ))
}

async fn record_acceptance(
    conn: &mut PgConnection,
    legal: &Legal,
    user_id: i64,
) -> Result<(), AppError> {
    let (terms, privacy) = (legal.terms_hash.as_deref(), legal.privacy_hash.as_deref());
    repo::insert_acceptances(conn, user_id, terms, privacy).await?;
    Ok(())
}

async fn start_session(conn: &mut PgConnection, user_id: i64) -> Result<String, AppError> {
    let token = domain::new_secret();
    let expires_at = Utc::now() + Duration::days(domain::SESSION_DAYS);
    repo::insert_session(conn, user_id, &domain::hash_token(&token), expires_at).await?;
    Ok(token)
}

/// argon2 takes tens of milliseconds of CPU; keep it off the async workers.
async fn hash_in_background(password: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || domain::hash_password(&password))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
}

async fn verify_in_background(password: String, stored_hash: String) -> Result<bool, AppError> {
    tokio::task::spawn_blocking(move || domain::verify_password(&password, &stored_hash))
        .await
        .map_err(|error| AppError::Internal(error.to_string()))
}
