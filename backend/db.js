// backend/db.js  — versão PostgreSQL (ESM)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variáveis do backend/.env e, se existir, também do .env da raiz
dotenv.config(); // backend/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') }); // fallback raiz

// Normalizador de valores de .env (remove aspas e espaços)
const norm = (v) => (v ?? '').toString().replace(/^"(.*)"$/, '$1').trim();

// Lê variáveis do Postgres
const PGHOST = norm(process.env.PGHOST) || 'localhost';
const PGPORT = Number(process.env.PGPORT) || 5432;
const PGUSER = norm(process.env.PGUSER) || 'postgres';
const PGDATABASE = norm(process.env.PGDATABASE) || 'gestao_leiteira';
const PGPASS =
  norm(process.env.PGPASSWORD) ||
  norm(process.env.DB_PASS) ||
  norm(process.env.DB_PASSWORD) ||
  '';

// Diagnóstico claro (sem revelar a senha)
if (!PGPASS) {
  console.error('❌ PGPASSWORD/DB_PASS não definido.');
  console.error('   Verifique se existe backend/.env ou .env na raiz com PGPASSWORD=... (sem aspas).');
  console.error('   Lidos:', {
    PGHOST,
    PGPORT,
    PGUSER,
    PGDATABASE,
    PGPASS_len: 0,
  });
  process.exit(1);
} else {
  console.log('🐘 Postgres env OK:', {
    PGHOST,
    PGPORT,
    PGUSER,
    PGDATABASE,
    PGPASS_len: PGPASS.length,
  });
}
const pool = new Pool({
  host: PGHOST,
  port: PGPORT,
  user: PGUSER,
  database: PGDATABASE,
  password: norm(PGPASS),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

async function run(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

async function one(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

// --- Helpers de tenant (schema por usuário) ---
function sanitizeEmail(email) {
  return String(email).toLowerCase().replace(/[@.]/g, '_').replace(/[^a-z0-9_]/g, '_');
}

function schemaFromIdentifier(identifier) {
  return `tenant_${sanitizeEmail(identifier)}`;
}

async function ensureTenantsTable() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS public.tenants (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      user_id INTEGER UNIQUE,
      schema_name TEXT UNIQUE
    )
  `);
}

async function ensureTenantSchema(identifier, userId = null) {
  const p = getPool();
  const schema = schemaFromIdentifier(identifier);
  // cria schema seguro (identificador só com [a-z0-9_])
  await p.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await ensureTenantsTable();
  // mapeia email -> schema (e user_id se informado)
  await p.query(
    `
      INSERT INTO public.tenants (email, user_id, schema_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (email)
      DO UPDATE SET user_id = COALESCE(EXCLUDED.user_id, tenants.user_id),
                    schema_name = EXCLUDED.schema_name
    `,
    [String(identifier).toLowerCase(), userId, schema]
  );
  return schema;
}

// === MIGRATIONS (PostgreSQL) ===
async function applyMigrations(client) {
  // Tipos:
  // - SERIAL PRIMARY KEY para IDs autoincrementáveis
  // - BOOLEAN em vez de INTEGER(0/1)
  // Mantivemos TEXT para datas para não quebrar o restante do app.

  await client.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome TEXT,
      nomeFazenda TEXT,
      email TEXT UNIQUE,
      telefone TEXT,
      senha TEXT,
      verificado BOOLEAN DEFAULT FALSE,
      codigoVerificacao TEXT,
      perfil TEXT DEFAULT 'usuario',
      tipoConta TEXT DEFAULT 'usuario',
      plano TEXT DEFAULT 'gratis',
      planoSolicitado TEXT DEFAULT NULL,
      formaPagamento TEXT DEFAULT NULL,
      dataCadastro TEXT DEFAULT NULL,
      metodoPagamentoId INTEGER,
      dataLiberado TEXT DEFAULT NULL,
      dataFimLiberacao TEXT DEFAULT NULL,
      dataFimTeste TEXT DEFAULT NULL,
      status TEXT DEFAULT 'ativo'
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS verificacoes_pendentes (
      email TEXT PRIMARY KEY,
      codigo TEXT NOT NULL,
      nome TEXT,
      nome_fazenda TEXT,
      telefone TEXT,
      senha_hash TEXT,
      plano_solicitado TEXT,
      forma_pagamento TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS produtores (
      id SERIAL PRIMARY KEY,
      nome TEXT,
      email TEXT UNIQUE,
      senha TEXT,
      emailVerificado BOOLEAN DEFAULT FALSE,
      codigoVerificacao TEXT,
      status TEXT DEFAULT 'ativo'
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS fazendas (
      id SERIAL PRIMARY KEY,
      nome TEXT,
      idProdutor INTEGER,
      limiteAnimais INTEGER DEFAULT 0
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS animais (
      id SERIAL PRIMARY KEY,
      numero INTEGER,
      brinco TEXT,
      nascimento TEXT,
      sexo TEXT,
      origem TEXT,
      categoria TEXT,
      idade TEXT,
      raca TEXT,
      checklistVermifugado BOOLEAN DEFAULT FALSE,
      checklistGrupoDefinido BOOLEAN DEFAULT FALSE,
      fichaComplementarOK BOOLEAN DEFAULT FALSE,
      pai TEXT,
      mae TEXT,
      ultimaIA TEXT,
      diagnosticoGestacao TEXT,
      previsaoParto TEXT,
      parto TEXT,
      secagem TEXT,
      estado TEXT DEFAULT 'vazia',
      nLactacoes INTEGER,
      status TEXT DEFAULT 'ativo',
      motivoSaida TEXT,
      dataSaida TEXT,
      valorVenda REAL,
      observacoesSaida TEXT,
      tipoSaida TEXT,
      del INTEGER,
      idProdutor INTEGER
    );
  `);

  // touros
  await client.query(`
    CREATE TABLE IF NOT EXISTS touros (
      id SERIAL PRIMARY KEY,
      nome TEXT,
      texto TEXT,
      arquivoBase64 TEXT,
      dataUpload TEXT,
      idProdutor INTEGER
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS tarefas (
      id SERIAL PRIMARY KEY,
      descricao TEXT NOT NULL,
      data TEXT,
      concluida BOOLEAN DEFAULT FALSE,
      idProdutor INTEGER
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS estoque (
      id SERIAL PRIMARY KEY,
      item TEXT NOT NULL,
      quantidade INTEGER,
      unidade TEXT,
      idProdutor INTEGER
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS protocolos_reprodutivos (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      idProdutor INTEGER
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS vacas (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      idade INTEGER,
      raca TEXT,
      idProdutor INTEGER
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS bezerras (
      id SERIAL PRIMARY KEY,
      nome TEXT,
      idProdutor INTEGER
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS produtos (
      id SERIAL PRIMARY KEY,
      dados TEXT,
      idProdutor INTEGER
    );
  `);

  // Tabelas genéricas para features novas (evita 500 enquanto evoluímos)
  await client.query(`
    CREATE TABLE IF NOT EXISTS configuracao (
      id SERIAL PRIMARY KEY,
      idProdutor INTEGER UNIQUE,
      dados JSONB DEFAULT '{}'::jsonb
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS dietas (
      id SERIAL PRIMARY KEY,
      idProdutor INTEGER,
      dados JSONB DEFAULT '{}'::jsonb
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ciclos_limpeza (
      id SERIAL PRIMARY KEY,
      idProdutor INTEGER,
      dados JSONB DEFAULT '{}'::jsonb
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS manejos_sanitarios (
      id SERIAL PRIMARY KEY,
      idProdutor INTEGER,
      dados JSONB DEFAULT '{}'::jsonb
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ajustes_estoque (
      id SERIAL PRIMARY KEY,
      idProdutor INTEGER,
      dados JSONB DEFAULT '{}'::jsonb
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS exames_sanitarios (
      id SERIAL PRIMARY KEY,
      dados TEXT,
      idProdutor INTEGER
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS reproducao (
      numero TEXT PRIMARY KEY,
      dados TEXT,
      idProdutor INTEGER
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS financeiro (
      id SERIAL PRIMARY KEY,
      data TEXT,
      descricao TEXT,
      valor REAL,
      tipo TEXT,
      categoria TEXT,
      subcategoria TEXT,
      origem TEXT,
      numeroAnimal TEXT,
      centroCusto TEXT,
      idProdutor INTEGER
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS eventos (
      id SERIAL PRIMARY KEY,
      tipo TEXT,
      title TEXT,
      date TEXT,
      descricao TEXT,
      subtipo TEXT,
      prioridadeVisual INTEGER,
      idProdutor INTEGER
    );
  `);

  // Tabela de eventos historizados por animal (mantida do seu código)
  await client.query(`
    CREATE TABLE IF NOT EXISTS eventos_animais (
      id SERIAL PRIMARY KEY,
      animal_id INTEGER,
      dataEvento TEXT,
      tipoEvento TEXT,
      descricao TEXT,
      idProdutor INTEGER
    );
  `);

  // Ajustes de colunas que antes eram feitos via PRAGMA no SQLite
  // Agora usamos "ADD COLUMN IF NOT EXISTS"
  const tabelasComProdutor = [
    'tarefas','estoque','protocolos_reprodutivos','vacas',
    'bezerras','reproducao','financeiro','eventos','produtos','exames_sanitarios'
  ];
  for (const tabela of tabelasComProdutor) {
    await client.query(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS idProdutor INTEGER;`);
  }

  // Campos extras em produtores/fazendas/usuarios (mantidos)
  await client.query(`ALTER TABLE produtores ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';`);
  await client.query(`ALTER TABLE fazendas ADD COLUMN IF NOT EXISTS limiteAnimais INTEGER DEFAULT 0;`);

  await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil TEXT DEFAULT 'usuario';`);
  await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipoConta TEXT DEFAULT 'usuario';`);
  await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plano TEXT DEFAULT 'gratis';`);
  await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS planoSolicitado TEXT DEFAULT NULL;`);
  await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS formaPagamento TEXT DEFAULT NULL;`);
  await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dataCadastro TEXT DEFAULT NULL;`);
  await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS metodoPagamentoId INTEGER;`);
  await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dataLiberado TEXT DEFAULT NULL;`);
  await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dataFimLiberacao TEXT DEFAULT NULL;`);
  await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dataFimTeste TEXT DEFAULT NULL;`);
  await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';`);
}

// Mantemos a assinatura original para não quebrar o resto do app
async function initDB(email, _forceCreate = true) {
  const conn = await pool.connect();
  try {
    await applyMigrations(conn);
    const who = sanitizeEmail(email || 'anon');
    console.log(`🐘 PostgreSQL conectado. Tenant lógico: ${who}`);
  } finally {
    conn.release();
  }
  return pool;
}

// === ADAPTADOR DE COMPATIBILIDADE SQLITE-LIKE PARA PG ===
function toPgParams(sql) {
  // troca cada '?' por $1, $2, ...
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function getPool() {
  // se você já tem 'pool' declarado acima, apenas exporte ele
  return pool;
}

function getDb() {
  const p = getPool();
  return {
    prepare(sql) {
      // se for INSERT e não tiver RETURNING, adiciona RETURNING id
      const needsReturning = /^\s*insert\s/i.test(sql) && !/returning\s/i.test(sql);
      const finalSql = needsReturning ? `${sql} RETURNING id` : sql;
      const pgSql = toPgParams(finalSql);
      return {
        // retorna um único registro (ou null)
        async get(...params) {
          try {
            const { rows } = await p.query(pgSql, params);
            return rows[0] || null;
          } catch (e) {
            console.error('DB.get error:', { sql: finalSql, params, e });
            throw e;
          }
        },
        // retorna lista
        async all(...params) {
          try {
            const { rows } = await p.query(pgSql, params);
            return rows;
          } catch (e) {
            console.error('DB.all error:', { sql: finalSql, params, e });
            throw e;
          }
        },
        // exec sem retorno (ou com RETURNING, se seu SQL tiver)
        async run(...params) {
          try {
            const res = await p.query(pgSql, params);
            return {
              changes: res.rowCount,
              lastInsertRowid: res.rows?.[0]?.id ?? null
            };
          } catch (e) {
            console.error('DB.run error:', { sql: finalSql, params, e });
            throw e;
          }
        }
      };
    },
    // compat: alguns lugares podem chamar db.exec(sql)
    async exec(sql) {
      try {
        await p.query(sql);
      } catch (e) {
        console.error('DB.exec error:', { sql, e });
        throw e;
      }
      return { changes: 0 };
    }
  };
}

// >>> MUDE AS EXPORTAÇÕES para expor o compat por padrão
export {
  pool,
  initDB,        // já existente no seu arquivo
  getDb,         // mantém compat
  getPool,       // caso você queira usar pool.query direto em arquivos novos
  sanitizeEmail,
  ensureTenantSchema,
  run,
  one
};