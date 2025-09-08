// backend/dbx.js  (ESM)
let mod;

// Tente importar o módulo de DB que você já usa no auth
try { mod = await import('./db.js'); } catch {}

// Se precisar, tente caminhos alternativos (descomente/ajuste):
// try { mod = mod || await import('./config/db.js'); } catch {}
// try { mod = mod || await import('./database.js'); } catch {}

if (!mod) {
  throw new Error('dbx(ESM): Não encontrei o módulo de DB (ex.: ./db.js). Ajuste o import.');
}

// Detecta formatos comuns: export default com {query}, ou {pool:{query}}, etc.
const maybe = mod.default ?? mod;
const db =
  (maybe?.query && maybe) ||
  (maybe?.pool?.query && maybe.pool) ||
  (maybe?.default?.query && maybe.default) ||
  (maybe?.default?.pool?.query && maybe.default.pool);

if (!db || typeof db.query !== 'function') {
  throw new Error('dbx(ESM): módulo de DB não expõe .query(text, params). Ajuste o import/acesso.');
}

export default db;
