const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

function getDBPath(email) {
  const sanitized = email.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, `${sanitized}.db`);
}

function initDB(email) {
  return new Promise((resolve, reject) => {
    const dbPath = getDBPath(email);
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      db.run(
        `CREATE TABLE IF NOT EXISTS usuarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT,
          email TEXT UNIQUE,
          nomeFazenda TEXT,
          telefone TEXT,
          senha TEXT,
          plano TEXT,
          formaPagamento TEXT
        )`,
        (err2) => {
          if (err2) return reject(err2);
          resolve(db);
        }
      );
    });
  });
}

module.exports = { initDB, getDBPath };
