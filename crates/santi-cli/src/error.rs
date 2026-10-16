use std::fmt;

use santi_types::Problem;

/// Everything a command or tool can fail with; `Display` is what the user reads.
#[derive(Debug)]
pub enum Error {
    /// The API answered with an RFC 9457 problem (D24).
    Api(Problem),
    /// The server could not be reached.
    Network(String),
    /// Bad input caught before any request.
    Usage(String),
    /// The user answered no to a confirmation.
    Declined(String),
    Other(String),
}

impl Error {
    /// 2 is clap's usage code; the others let scripts branch without parsing text.
    pub fn exit_code(&self) -> u8 {
        match self {
            Error::Api(problem) => match problem.status {
                401 | 403 => 3,
                404 => 4,
                400 | 409 | 422 => 5,
                _ => 1,
            },
            Error::Network(_) => 6,
            Error::Usage(_) => 2,
            Error::Declined(_) => 10,
            Error::Other(_) => 1,
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let problem = match self {
            Error::Api(problem) => problem,
            Error::Network(text)
            | Error::Usage(text)
            | Error::Declined(text)
            | Error::Other(text) => {
                return f.write_str(text);
            }
        };
        f.write_str(&problem.detail)?;
        if problem.status == 401 {
            f.write_str(" Run `santi login` with a valid API token.")?;
        }
        for error in &problem.errors {
            write!(f, "\n  {}: {}", error.field, error.message)?;
        }
        Ok(())
    }
}

/// The problem in an error body, or one made from the status when the body is not a problem
/// (a proxy's HTML page, an empty 502).
pub fn problem_from(status: u16, body: &[u8]) -> Problem {
    if let Ok(problem) = serde_json::from_slice(body) {
        return problem;
    }
    let text: String = String::from_utf8_lossy(body)
        .trim()
        .chars()
        .take(200)
        .collect();
    let detail = match text.is_empty() {
        true => format!("HTTP {status}"),
        false => format!("HTTP {status}: {text}"),
    };
    Problem {
        problem_type: "about:blank".into(),
        title: format!("HTTP {status}"),
        status,
        detail,
        errors: vec![],
    }
}

#[cfg(test)]
mod tests {
    use santi_types::FieldError;

    use super::*;

    fn problem(status: u16, detail: &str) -> Problem {
        Problem {
            problem_type: "urn:santi:error:test".into(),
            title: "Title".into(),
            status,
            detail: detail.into(),
            errors: vec![],
        }
    }

    #[test]
    fn exit_codes_follow_the_problem_status() {
        let codes = [401, 403, 404, 400, 409, 422, 500]
            .map(|status| Error::Api(problem(status, "x")).exit_code());
        assert_eq!(codes, [3, 3, 4, 5, 5, 5, 1]);
        assert_eq!(Error::Network("down".into()).exit_code(), 6);
        assert_eq!(Error::Usage("bad key".into()).exit_code(), 2);
        assert_eq!(Error::Declined("Kept WEB-1".into()).exit_code(), 10);
        assert_eq!(Error::Other("disk".into()).exit_code(), 1);
    }

    #[test]
    fn message_is_the_detail_with_each_field_error() {
        let mut invalid = problem(422, "The request is invalid.");
        invalid.errors = vec![FieldError {
            field: "summary".into(),
            message: "must not be empty".into(),
        }];
        assert_eq!(
            Error::Api(invalid).to_string(),
            "The request is invalid.\n  summary: must not be empty"
        );
    }

    #[test]
    fn unauthorized_points_at_login() {
        let message = Error::Api(problem(401, "Sign in first.")).to_string();
        assert_eq!(
            message,
            "Sign in first. Run `santi login` with a valid API token."
        );
    }

    #[test]
    fn problem_body_is_parsed() {
        let body = br#"{"type":"urn:santi:error:not_found","title":"Not found","status":404,"detail":"No issue WEB-9."}"#;
        let parsed = problem_from(404, body);
        assert_eq!(parsed.problem_type, "urn:santi:error:not_found");
        assert_eq!(parsed.detail, "No issue WEB-9.");
    }

    #[test]
    fn other_bodies_become_a_problem_from_the_status() {
        let html = problem_from(502, b"<html>Bad Gateway</html>");
        assert_eq!(html.status, 502);
        assert_eq!(html.detail, "HTTP 502: <html>Bad Gateway</html>");
        assert_eq!(problem_from(503, b"").detail, "HTTP 503");
    }

    #[test]
    fn other_errors_print_their_text() {
        assert_eq!(Error::Usage("bad key".into()).to_string(), "bad key");
        assert_eq!(Error::Network("refused".into()).to_string(), "refused");
    }
}
