SELECT i.id, p.key || '-' || i.number AS "key!", i.number, i.summary, i.description,
       i.issue_type AS "issue_type: IssueType", i.priority AS "priority: Priority",
       i.status_id, s.name AS status_name, i.assignee_id, assignee.display_name AS "assignee_name?",
       i.reporter_id, reporter.display_name AS reporter_name, i.points, i.labels,
       p.key || '-' || parent.number AS parent_key, i.sprint_id, sprint.name AS "sprint_name?",
       i.rank, i.done_at, i.created_at, i.updated_at
FROM issue i
JOIN project p ON p.id = i.project_id
JOIN status s ON s.id = i.status_id
JOIN app_user reporter ON reporter.id = i.reporter_id
LEFT JOIN app_user assignee ON assignee.id = i.assignee_id
LEFT JOIN sprint ON sprint.id = i.sprint_id
LEFT JOIN issue parent ON parent.id = i.parent_id
WHERE i.project_id = $1
  AND i.id > $2
  AND ((cardinality($3::bigint[]) = 0 AND NOT $12)
       OR i.assignee_id = ANY($3)
       OR ($12 AND i.assignee_id IS NULL))
  AND (cardinality($4::text[]) = 0 OR i.issue_type = ANY($4))
  AND (cardinality($5::text[]) = 0 OR i.labels && $5)
  AND ((cardinality($6::bigint[]) = 0 AND NOT $7)
       OR parent.number = ANY($6)
       OR ($7 AND i.parent_id IS NULL))
  AND ($8::text IS NULL OR i.summary ILIKE $8 OR ($13::bigint IS NOT NULL AND i.number = $13))
  AND ($9::timestamptz IS NULL OR i.updated_at > $9)
  AND (cardinality($10::text[]) = 0 OR s.category = ANY($10))
ORDER BY i.id
LIMIT $11
