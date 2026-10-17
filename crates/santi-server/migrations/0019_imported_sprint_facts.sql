-- D46: imported closed sprints (D41) hold issues but no facts; their issues count as completed
-- work present from the start. Native closed sprints already have these rows.
INSERT INTO sprint_issue (sprint_id, issue_id, added_after_start, points_at_start, outcome, points_at_close)
SELECT i.sprint_id, i.id, false, i.points, 'completed', i.points
FROM issue i JOIN sprint s ON s.id = i.sprint_id AND s.state = 'closed'
ON CONFLICT (sprint_id, issue_id) DO NOTHING;
