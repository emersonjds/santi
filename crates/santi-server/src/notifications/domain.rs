use std::collections::BTreeSet;

use santi_types::notifications::NotificationKind;

/// D50: the user ids of every `[@Name](mention:<id>)` token; `\` escapes the next character of
/// the name, and an unescaped `[` or `]` inside it is not a token.
pub fn mention_ids(text: &str) -> BTreeSet<i64> {
    let mut ids = BTreeSet::new();
    let mut from = 0;
    while let Some(found) = text[from..].find("[@") {
        from += found + 2;
        if let Some((id, end)) = token_at(text.as_bytes(), from) {
            ids.insert(id);
            from = end;
        }
    }
    ids
}

/// The id of the token whose name starts at `index`, and the byte right after the token.
fn token_at(bytes: &[u8], mut index: usize) -> Option<(i64, usize)> {
    loop {
        match bytes.get(index)? {
            b'\\' => index += 2,
            b'[' => return None,
            b']' => break,
            _ => index += 1,
        }
    }
    const LINK: &[u8] = b"(mention:";
    let rest = bytes.get(index + 1..)?.strip_prefix(LINK)?;
    let digits = rest.iter().take_while(|byte| byte.is_ascii_digit()).count();
    if rest.get(digits) != Some(&b')') {
        return None;
    }
    let id = std::str::from_utf8(&rest[..digits]).ok()?.parse().ok()?;
    Some((id, index + 1 + LINK.len() + digits + 1))
}

/// The ids an edit adds: mentioned in `new` and not in `old`.
pub fn added_mentions(old: &str, new: &str) -> BTreeSet<i64> {
    let before = mention_ids(old);
    mention_ids(new)
        .into_iter()
        .filter(|id| !before.contains(id))
        .collect()
}

/// One event per person: an assignment wins over a mention, a mention over a comment; the actor
/// is never told.
pub fn recipients(
    actor_id: i64,
    mentioned: &BTreeSet<i64>,
    assigned: Option<i64>,
    watchers: &[i64],
) -> Vec<(i64, NotificationKind)> {
    let mut seen = BTreeSet::from([actor_id]);
    let assignment = assigned.map(|id| (id, NotificationKind::Assigned));
    let mentions = mentioned.iter().map(|id| (*id, NotificationKind::Mention));
    let comments = watchers.iter().map(|id| (*id, NotificationKind::Comment));
    assignment
        .into_iter()
        .chain(mentions)
        .chain(comments)
        .filter(|(id, _)| seen.insert(*id))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use NotificationKind::{Assigned, Comment, Mention};

    fn ids(list: &[i64]) -> BTreeSet<i64> {
        list.iter().copied().collect()
    }

    #[test]
    fn mention_tokens_give_their_user_ids_once_each() {
        let text = "Hi [@Ana](mention:7) and [@Bo Li](mention:12), again [@Ana](mention:7).";
        assert_eq!(mention_ids(text), ids(&[7, 12]));
    }

    #[test]
    fn escaped_names_are_still_mentions() {
        let text = r"[@Ana \[QA\] O\\Neil](mention:3) [@Zoë\.](mention:4)";
        assert_eq!(mention_ids(text), ids(&[3, 4]));
    }

    #[test]
    fn what_is_not_a_token_is_ignored() {
        for text in [
            "plain @Ana text",
            "[Ana](mention:7)",
            "[@Ana](mention:)",
            "[@Ana](mention:7x)",
            "[@Ana](https://example.com/7)",
            "[@A[na](mention:7)",
            "[@Ana](mention:99999999999999999999)",
            "[@Ana\\](mention:7)",
            "[@",
        ] {
            assert_eq!(mention_ids(text), ids(&[]), "{text}");
        }
    }

    #[test]
    fn a_broken_token_does_not_hide_the_next_one() {
        let text = "[@x [@Bo](mention:5) [@\\é](mention:6)";
        assert_eq!(mention_ids(text), ids(&[5, 6]));
    }

    #[test]
    fn an_edit_adds_only_the_new_ids() {
        let old = "[@Ana](mention:1) [@Bo](mention:2)";
        let new = "[@Bo](mention:2) [@Cy](mention:3)";
        assert_eq!(added_mentions(old, new), ids(&[3]));
        assert_eq!(added_mentions(new, new), ids(&[]));
    }

    #[test]
    fn an_assignment_wins_over_a_mention_and_the_actor_is_never_told() {
        let told = recipients(1, &ids(&[1, 2, 3]), Some(3), &[2, 4, 4, 1]);
        assert_eq!(told, [(3, Assigned), (2, Mention), (4, Comment)]);
    }

    #[test]
    fn an_assignment_wins_over_a_comment_and_self_assignment_is_silent() {
        assert_eq!(recipients(1, &ids(&[]), Some(5), &[5]), [(5, Assigned)]);
        assert_eq!(recipients(1, &ids(&[]), Some(1), &[]), []);
    }
}
