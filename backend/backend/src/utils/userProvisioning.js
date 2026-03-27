const fs = require("fs");
const path = require("path");

async function ensureUsersRootFolder(client, actorId) {
  const existing = await client.query(
    "SELECT id, folder_id FROM folders WHERE parent_id IS NULL AND LOWER(name) = 'users' LIMIT 1"
  );

  if (existing.rows.length) return existing.rows[0];

  const created = await client.query(
    `
    INSERT INTO folders (name, parent_id, created_by, folder_id, folder_path, quota_mb)
    VALUES ('users', NULL, $1, COALESCE((SELECT MAX(folder_id) + 1 FROM folders), 1), '/users', 50)
    RETURNING id, folder_id
    `,
    [actorId]
  );
  return created.rows[0];
}

async function provisionUserFolder(client, user, actorId) {
  const usersRoot = await ensureUsersRootFolder(client, actorId);

  const existingFolder = await client.query(
    "SELECT id, folder_id, folder_path, quota_mb FROM folders WHERE parent_id = $1 AND name = $2 LIMIT 1",
    [usersRoot.id, user.username]
  );
  if (existingFolder.rows.length) return existingFolder.rows[0];

  const folder = await client.query(
    `
    INSERT INTO folders (name, parent_id, created_by, user_id, folder_id, folder_path, quota_mb)
    VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(folder_id) + 1 FROM folders), 1), $5, 50)
    RETURNING id, folder_id, folder_path, quota_mb
    `,
    [user.username, usersRoot.id, user.id, user.user_id || user.id, `/users/${user.username}`]
  );

  const filesystemFolder = path.join(__dirname, "../../uploads/users", user.username);
  fs.mkdirSync(filesystemFolder, { recursive: true });

  return folder.rows[0];
}

module.exports = { ensureUsersRootFolder, provisionUserFolder };
