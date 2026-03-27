-- PostgreSQL schema for user + folder + file upload management
-- Compatible with app bootstrap migration.

CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS folders (
  folder_id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
  folder_path VARCHAR(255) NOT NULL,
  quota_mb INT DEFAULT 50,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
  file_id SERIAL PRIMARY KEY,
  folder_id INT REFERENCES folders(folder_id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  file_size_mb INT NOT NULL CHECK (file_size_mb <= 50),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  checksum VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  log_id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(user_id),
  action VARCHAR(100),
  details TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
