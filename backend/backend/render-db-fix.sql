-- Run this on the same Postgres database used by https://bank-dms.onrender.com
-- It adds the columns expected by backend/backend/src/routes/document.routes.js

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS user_id INTEGER,
  ADD COLUMN IF NOT EXISTS email VARCHAR(150),
  ADD COLUMN IF NOT EXISTS client_id INTEGER,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP;

UPDATE users
SET user_id = id
WHERE user_id IS NULL;

UPDATE users
SET email = username || '@local.bank-dms'
WHERE email IS NULL;

ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS parent_id INTEGER,
  ADD COLUMN IF NOT EXISTS folder_id INTEGER,
  ADD COLUMN IF NOT EXISTS user_id INTEGER,
  ADD COLUMN IF NOT EXISTS folder_path VARCHAR(255),
  ADD COLUMN IF NOT EXISTS quota_mb INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS client_id INTEGER;

UPDATE folders
SET folder_id = id
WHERE folder_id IS NULL;

UPDATE folders
SET folder_path = '/users/' || name
WHERE folder_path IS NULL;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS version_no INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS retention_until TIMESTAMP;

CREATE TABLE IF NOT EXISTS files (
  file_id SERIAL PRIMARY KEY,
  folder_id INT,
  client_id INT,
  filename VARCHAR(255) NOT NULL,
  file_size_mb INT NOT NULL DEFAULT 1,
  file_type VARCHAR(20),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  checksum VARCHAR(64)
);

SELECT column_name
FROM information_schema.columns
WHERE table_name = 'documents'
ORDER BY ordinal_position;
