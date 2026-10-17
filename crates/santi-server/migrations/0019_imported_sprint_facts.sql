-- D46: imported closed sprints (D41) hold issues but no facts; their issues count as completed
-- work present from the start. Native closed sprints already have rows and stay as they closed.
INSERT INTO sprint_issue (sprint_id, issue_id, added_after_start, points_at_start, outcome, points_at_close)
SELECT i.sprint_id, i.id, false, i.points, 'completed', i.points
FROM issue i JOIN sprint s ON s.id = i.sprint_id AND s.state = 'closed'
WHERE NOT EXISTS (SELECT 1 FROM sprint_issue x WHERE x.sprint_id = s.id)
ON CONFLICT (sprint_id, issue_id) DO NOTHING;
