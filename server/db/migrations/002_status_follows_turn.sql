-- Keep "Answered" honest: a doubt is Answered only while the educator's message is the last one.
-- Earlier data (and manual status changes) could leave a doubt Answered after the student wrote
-- again. Message history is untouched; only the status label is corrected.
UPDATE doubts d
   SET status = CASE WHEN EXISTS (SELECT 1 FROM messages m WHERE m.doubt_id = d.id) THEN 'in_progress'::doubt_status
                     ELSE 'open'::doubt_status END
 WHERE d.status = 'answered'
   AND COALESCE((
         SELECT u.role FROM messages m LEFT JOIN users u ON u.id = m.sender_id
          WHERE m.doubt_id = d.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
       ), 'none') <> 'educator';
