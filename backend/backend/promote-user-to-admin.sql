-- Run in pgAdmin against the database used by backend/backend.
-- Replace the username below with the self-signup account that should get admin rights.

UPDATE users
SET
  role = 'admin',
  is_active = COALESCE(is_active, TRUE),
  must_reset_password = COALESCE(must_reset_password, FALSE),
  activated_at = COALESCE(activated_at, NOW())
WHERE username = 'adminmade_1774514605';

SELECT id, username, role, is_active
FROM users
WHERE username = 'adminmade_1774514605';
