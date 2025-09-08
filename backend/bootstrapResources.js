// backend/bootstrapResources.js  (ESM)
import db from './dbx.js';

/**
 * Cria/ajusta tabelas dos recursos.
 * - IDs como TEXT com DEFAULT gen_random_uuid()::text (compatível com bases antigas)
 * - Garante colunas/índices esperados
 */
export async function ensureTables() {
  const sql = `
    -- extensão p/ gen_random_uuid()
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    /* ========== animals ========== */
    CREATE TABLE IF NOT EXISTS animals (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      numero TEXT,
      brinco TEXT,
      nascimento TEXT,
      raca TEXT,
      estado TEXT DEFAULT 'vazia',
      sexo TEXT,
      categoria TEXT,
      pai TEXT,
      mae TEXT,
      n_lactacoes INTEGER,
      ultima_ia TEXT,
      parto TEXT,
      previsao_parto TEXT,
      historico JSONB
      -- created_at/updated_at podem não existir em bases antigas: adicionamos abaixo
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_attrdef d
        JOIN pg_class c ON c.oid = d.adrelid
        JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE c.relname = 'animals' AND a.attname = 'id'
      ) THEN
        ALTER TABLE animals ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
      END IF;
    END$$;

    -- Colunas que podem faltar em bases antigas
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS owner_id TEXT;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS sexo TEXT;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS categoria TEXT;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS pai TEXT;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS mae TEXT;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS n_lactacoes INTEGER;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS previsao_parto TEXT;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS historico JSONB;

    -- Garantir colunas de auditoria e defaults
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    ALTER TABLE animals ALTER COLUMN created_at SET DEFAULT now();
    ALTER TABLE animals ALTER COLUMN updated_at SET DEFAULT now();

    CREATE INDEX IF NOT EXISTS idx_animals_owner  ON animals(owner_id);
    CREATE INDEX IF NOT EXISTS idx_animals_num    ON animals(numero);
    CREATE INDEX IF NOT EXISTS idx_animals_brinco ON animals(brinco);

    /* ========== products (já existente) ========== */
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      nome TEXT NOT NULL,
      categoria TEXT,
      unidade TEXT,
      preco_unit DOUBLE PRECISION,
      quantidade DOUBLE PRECISION,
      validade TEXT
      -- created_at/updated_at podem faltar: garantimos abaixo
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_attrdef d
        JOIN pg_class c ON c.oid = d.adrelid
        JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE c.relname = 'products' AND a.attname = 'id'
      ) THEN
        ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
      END IF;
    END$$;

    ALTER TABLE products ADD COLUMN IF NOT EXISTS owner_id TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    ALTER TABLE products ALTER COLUMN created_at SET DEFAULT now();
    ALTER TABLE products ALTER COLUMN updated_at SET DEFAULT now();
    CREATE INDEX IF NOT EXISTS idx_products_owner ON products(owner_id);

    /* ========== calendar_events (já existente) ========== */
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      title TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN (
        'parto','secagem','preparto','vacina','exame','limpeza',
        'estoque','checkup','dispositivo','hormonio','tratamento','protocolo'
      )),
      start TIMESTAMPTZ NOT NULL,
      "end" TIMESTAMPTZ,
      all_day BOOLEAN DEFAULT TRUE,
      prioridade_visual BOOLEAN DEFAULT TRUE,
      notes TEXT
      -- created_at/updated_at podem faltar: garantimos abaixo
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_attrdef d
        JOIN pg_class c ON c.oid = d.adrelid
        JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE c.relname = 'calendar_events' AND a.attname = 'id'
      ) THEN
        ALTER TABLE calendar_events ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
      END IF;
    END$$;

    ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
    ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    ALTER TABLE calendar_events ALTER COLUMN created_at SET DEFAULT now();
    ALTER TABLE calendar_events ALTER COLUMN updated_at SET DEFAULT now();

    CREATE INDEX IF NOT EXISTS idx_calendar_events_owner       ON calendar_events(owner_id);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_owner_start ON calendar_events(owner_id, start);

    /* ====================== REPRODUÇÃO ====================== */
    -- Modelos de protocolos
    CREATE TABLE IF NOT EXISTS repro_protocolo (
      id         TEXT PRIMARY KEY,
      owner_id   TEXT,
      nome       TEXT NOT NULL,
      descricao  TEXT,
      tipo       TEXT,
      etapas     JSONB NOT NULL,
      ativo      BOOLEAN DEFAULT TRUE
      -- created_at/updated_at garantidos abaixo
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_attrdef d
        JOIN pg_class c ON c.oid = d.adrelid
        JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE c.relname = 'repro_protocolo' AND a.attname = 'id'
      ) THEN
        ALTER TABLE repro_protocolo ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
      END IF;
    END$$;

    ALTER TABLE repro_protocolo ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
    ALTER TABLE repro_protocolo ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    ALTER TABLE repro_protocolo ALTER COLUMN created_at SET DEFAULT now();
    ALTER TABLE repro_protocolo ALTER COLUMN updated_at SET DEFAULT now();

    CREATE INDEX IF NOT EXISTS idx_repro_protocolo_owner ON repro_protocolo(owner_id);
    CREATE INDEX IF NOT EXISTS idx_repro_protocolo_tipo  ON repro_protocolo(tipo);
    CREATE INDEX IF NOT EXISTS idx_repro_protocolo_nome  ON repro_protocolo((lower(nome)));

    -- Eventos reprodutivos
    CREATE TABLE IF NOT EXISTS repro_evento (
      id            TEXT PRIMARY KEY,
      owner_id      TEXT,
      animal_id     TEXT NOT NULL,
      data          DATE NOT NULL,
      tipo          TEXT NOT NULL,   -- IA | DIAGNOSTICO | PARTO | PROTOCOLO_ETAPA | TRATAMENTO
      detalhes      JSONB,
      resultado     TEXT,
      protocolo_id  TEXT,
      aplicacao_id  TEXT
      -- created_at/updated_at garantidos abaixo
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_attrdef d
        JOIN pg_class c ON c.oid = d.adrelid
        JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE c.relname = 'repro_evento' AND a.attname = 'id'
      ) THEN
        ALTER TABLE repro_evento ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
      END IF;
    END$$;

    ALTER TABLE repro_evento ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
    ALTER TABLE repro_evento ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    ALTER TABLE repro_evento ALTER COLUMN created_at SET DEFAULT now();
    ALTER TABLE repro_evento ALTER COLUMN updated_at SET DEFAULT now();

    CREATE INDEX IF NOT EXISTS idx_repro_evento_owner      ON repro_evento(owner_id);
    CREATE INDEX IF NOT EXISTS idx_repro_evento_animal     ON repro_evento(animal_id);
    CREATE INDEX IF NOT EXISTS idx_repro_evento_tipo       ON repro_evento(tipo);
    CREATE INDEX IF NOT EXISTS idx_repro_evento_data       ON repro_evento(data);
    CREATE INDEX IF NOT EXISTS idx_repro_evento_aplicacao  ON repro_evento(aplicacao_id);

    /* ====================== NOVO: Genética & Inseminadores ====================== */
    -- Cadastro de Touros (estoque para reprodução)
    CREATE TABLE IF NOT EXISTS genetica_touro (
      id               TEXT PRIMARY KEY,
      owner_id         TEXT,
      nome             TEXT NOT NULL,
      codigo           TEXT,
      ativo            BOOLEAN DEFAULT TRUE,
      volume_dose      DOUBLE PRECISION, -- 0.25 ou 0.5 mL
      marca            TEXT,
      valor_por_dose   DOUBLE PRECISION,
      quantidade       INTEGER DEFAULT 0
      -- created_at/updated_at garantidos abaixo
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_attrdef d
        JOIN pg_class c ON c.oid = d.adrelid
        JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE c.relname = 'genetica_touro' AND a.attname = 'id'
      ) THEN
        ALTER TABLE genetica_touro ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
      END IF;
    END$$;

    ALTER TABLE genetica_touro ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
    ALTER TABLE genetica_touro ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    ALTER TABLE genetica_touro ALTER COLUMN created_at SET DEFAULT now();
    ALTER TABLE genetica_touro ALTER COLUMN updated_at SET DEFAULT now();

    CREATE INDEX IF NOT EXISTS idx_genetica_touro_owner  ON genetica_touro(owner_id);
    CREATE INDEX IF NOT EXISTS idx_genetica_touro_codigo ON genetica_touro(codigo);

    -- Cadastro de Inseminadores
    CREATE TABLE IF NOT EXISTS repro_inseminador (
      id         TEXT PRIMARY KEY,
      owner_id   TEXT,
      nome       TEXT NOT NULL,
      registro   TEXT,
      ativo      BOOLEAN DEFAULT TRUE
      -- created_at/updated_at garantidos abaixo
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_attrdef d
        JOIN pg_class c ON c.oid = d.adrelid
        JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE c.relname = 'repro_inseminador' AND a.attname = 'id'
      ) THEN
        ALTER TABLE repro_inseminador ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
      END IF;
    END$$;

    ALTER TABLE repro_inseminador ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
    ALTER TABLE repro_inseminador ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    ALTER TABLE repro_inseminador ALTER COLUMN created_at SET DEFAULT now();
    ALTER TABLE repro_inseminador ALTER COLUMN updated_at SET DEFAULT now();

    CREATE INDEX IF NOT EXISTS idx_repro_insem_owner ON repro_inseminador(owner_id);
    CREATE INDEX IF NOT EXISTS idx_repro_insem_nome  ON repro_inseminador((lower(nome)));
  `;
  await db.query(sql);
}
