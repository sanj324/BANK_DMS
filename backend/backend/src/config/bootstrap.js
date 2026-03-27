const pool = require("./db");

async function bootstrapDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(150),
      password TEXT NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS folders (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      file_path TEXT NOT NULL,
      status VARCHAR(30) DEFAULT 'PENDING',
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
      file_size BIGINT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      entity VARCHAR(50) NOT NULL,
      entity_id INTEGER,
      details TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS user_id INTEGER,
      ADD COLUMN IF NOT EXISTS email VARCHAR(150),
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS client_id INTEGER,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP;
  `);

  await pool.query(`
    UPDATE users
    SET user_id = id
    WHERE user_id IS NULL;
  `);

  await pool.query(`
    UPDATE users
    SET email = username || '@local.bank-dms'
    WHERE email IS NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_user_id_unique'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_user_id_unique UNIQUE (user_id);
      END IF;
    END
    $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_email_unique'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
      END IF;
    END
    $$;
  `);

  await pool.query(`
    ALTER TABLE users
      ALTER COLUMN user_id SET NOT NULL,
      ALTER COLUMN email SET NOT NULL,
      ALTER COLUMN role SET DEFAULT 'user';
  `);

  await pool.query(`
    ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_role_check;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (
      role IN (
        'user', 'admin', 'maker', 'checker', 'super_admin', 'client_admin', 'viewer',
        'USER', 'ADMIN', 'MAKER', 'CHECKER', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'VIEWER'
      )
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      client_id SERIAL PRIMARY KEY,
      client_uid VARCHAR(100) UNIQUE NOT NULL,
      client_name VARCHAR(180) NOT NULL,
      contact_name VARCHAR(180),
      contact_email_encrypted TEXT,
      contact_phone_encrypted TEXT,
      industry VARCHAR(100),
      subscription_start DATE NOT NULL,
      subscription_expiry DATE NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      logo_url TEXT,
      primary_color VARCHAR(20) DEFAULT '#0f2a44',
      secondary_color VARCHAR(20) DEFAULT '#2b7cd3',
      storage_quota_mb INTEGER DEFAULT 1024,
      allowed_file_types TEXT[] DEFAULT ARRAY['pdf','docx','xlsx','png','jpg','jpeg'],
      default_root_folder VARCHAR(150) DEFAULT 'Documents',
      default_folders JSONB DEFAULT '["Compliance","Legal","HR"]'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      terminated_at TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS storage_quota_mb INTEGER DEFAULT 1024,
      ADD COLUMN IF NOT EXISTS allowed_file_types TEXT[] DEFAULT ARRAY['pdf','docx','xlsx','png','jpg','jpeg'],
      ADD COLUMN IF NOT EXISTS default_root_folder VARCHAR(150) DEFAULT 'Documents',
      ADD COLUMN IF NOT EXISTS default_folders JSONB DEFAULT '["Compliance","Legal","HR"]'::jsonb;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_client_id_fkey'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);

  await pool.query(`
    ALTER TABLE folders
      ADD COLUMN IF NOT EXISTS folder_id INTEGER,
      ADD COLUMN IF NOT EXISTS user_id INTEGER,
      ADD COLUMN IF NOT EXISTS folder_path VARCHAR(255),
      ADD COLUMN IF NOT EXISTS quota_mb INTEGER DEFAULT 50,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  await pool.query(`
    UPDATE folders
    SET folder_id = id
    WHERE folder_id IS NULL;
  `);

  await pool.query(`
    UPDATE folders f
    SET user_id = u.user_id
    FROM users u
    WHERE f.user_id IS NULL
      AND f.created_by = u.id;
  `);

  await pool.query(`
    UPDATE folders
    SET folder_path = '/users/' || name
    WHERE folder_path IS NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'folders_folder_id_unique'
      ) THEN
        ALTER TABLE folders ADD CONSTRAINT folders_folder_id_unique UNIQUE (folder_id);
      END IF;
    END
    $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'folders_user_id_fkey'
      ) THEN
        ALTER TABLE folders
        ADD CONSTRAINT folders_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
      END IF;
    END
    $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS files (
      file_id SERIAL PRIMARY KEY,
      folder_id INT REFERENCES folders(folder_id) ON DELETE CASCADE,
      client_id INT REFERENCES clients(client_id) ON DELETE CASCADE,
      filename VARCHAR(255) NOT NULL,
      file_size_mb INT NOT NULL CHECK (file_size_mb <= 50),
      file_type VARCHAR(20),
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64)
    );
  `);

  await pool.query(`
    ALTER TABLE folders
      ADD COLUMN IF NOT EXISTS client_id INTEGER;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'folders_client_id_fkey'
      ) THEN
        ALTER TABLE folders
        ADD CONSTRAINT folders_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE;
      END IF;
    END
    $$;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_one_client_admin_per_client
    ON users(client_id)
    WHERE LOWER(role) = 'client_admin';
  `);

  await pool.query(`
    ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS log_id INTEGER,
      ADD COLUMN IF NOT EXISTS details TEXT,
      ADD COLUMN IF NOT EXISTS ip_address TEXT,
      ADD COLUMN IF NOT EXISTS user_agent TEXT,
      ADD COLUMN IF NOT EXISTS request_id VARCHAR(80),
      ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  await pool.query(`
    UPDATE audit_logs
    SET log_id = id
    WHERE log_id IS NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'audit_logs_log_id_unique'
      ) THEN
        ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_log_id_unique UNIQUE (log_id);
      END IF;
    END
    $$;
  `);

  await pool.query(`
    ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT,
      ADD COLUMN IF NOT EXISTS version_no INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS retention_until TIMESTAMP;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS document_access_logs (
      id SERIAL PRIMARY KEY,
      document_id INTEGER REFERENCES documents(id),
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL,
      revoked_at TIMESTAMP,
      replaced_by_hash TEXT,
      ip_address TEXT,
      user_agent TEXT
    );
  `);
}

module.exports = bootstrapDatabase;
