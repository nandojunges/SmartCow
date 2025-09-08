import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeEmail(email) {
  return email.replace(/[@.]/g, '_');
}

const statusPath = path.join(__dirname, '..', 'backupStatus.json');

async function loadStatus() {
  try {
    const data = await fs.readFile(statusPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

async function saveStatus(status) {
  await fs.writeFile(statusPath, JSON.stringify(status, null, 2));
}

function getDBPath(email) {
  const file = `${sanitizeEmail(email)}.sqlite`;
  return path.join(process.cwd(), 'db', file);
}

export async function backupDatabase(email) {
  const status = await loadStatus();
  const hoje = new Date().toISOString().slice(0, 10);
  if (status[email] === hoje) {
    return;
  }

  const dbPath = getDBPath(email);
  const backupDir = path.join(__dirname, '..', 'backups', sanitizeEmail(email));
  const backupFile = path.join(backupDir, `${hoje}.sqlite`);

  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(dbPath, backupFile);

  status[email] = hoje;
  await saveStatus(status);
}

export { };
