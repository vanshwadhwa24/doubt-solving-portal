TRUNCATE attachments, messages, doubts RESTART IDENTITY CASCADE;
INSERT INTO doubts (student_id, course_id, title, description, status, created_at, updated_at)
SELECT (SELECT id FROM users WHERE role='student' ORDER BY id LIMIT 1), 1 + (g % 2), 'Doubt '||g, 'question about topic '||g||' pointers recursion', (ARRAY['open','in_progress','answered','resolved']::doubt_status[])[1 + g % 4], now() - (g||' minutes')::interval, now() - (g||' minutes')::interval
FROM generate_series(1,20000) g;
INSERT INTO messages (doubt_id, sender_id, body, created_at)
SELECT d.id, (SELECT id FROM users WHERE role = CASE WHEN d.id % 2 = 0 THEN 'educator' ELSE 'student' END ORDER BY id LIMIT 1), 'reply '||d.id, d.created_at + interval '1 minute' FROM doubts d;
ANALYZE;
