use santi_types::issues::Page;

use crate::error::AppError;

pub const DEFAULT_LIMIT: i64 = 50;
pub const MAX_LIMIT: i64 = 200;

pub fn page_limit(limit: Option<i64>) -> Result<i64, AppError> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT);
    if !(1..=MAX_LIMIT).contains(&limit) {
        return Err(AppError::invalid("limit", "must be between 1 and 200"));
    }
    Ok(limit)
}

/// `items` holds up to `limit + 1` rows ordered by id; the extra row only signals a next page.
pub fn into_page<T>(mut items: Vec<T>, limit: i64, id_of: fn(&T) -> i64) -> Page<T> {
    let has_more = items.len() > limit as usize;
    items.truncate(limit as usize);
    let next_cursor = if has_more {
        items.last().map(id_of)
    } else {
        None
    };
    Page { items, next_cursor }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limit_defaults_to_50_and_caps_at_200() {
        assert_eq!(page_limit(None).unwrap(), 50);
        assert_eq!(page_limit(Some(200)).unwrap(), 200);
        assert!(page_limit(Some(201)).is_err());
        assert!(page_limit(Some(0)).is_err());
    }

    #[test]
    fn an_extra_row_means_there_is_a_next_page() {
        let page = into_page(vec![1_i64, 2, 3], 2, |item| *item);
        assert_eq!(page.items, [1, 2]);
        assert_eq!(page.next_cursor, Some(2));
        let last = into_page(vec![3_i64], 2, |item| *item);
        assert_eq!(last.next_cursor, None);
    }
}
