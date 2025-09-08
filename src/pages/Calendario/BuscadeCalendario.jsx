// src/pages/Calendario/BuscadeCalendario.jsx
// -----------------------------------------------------------------------------
// Hook do Calendário – eventos + protocolos (com checagem real do status do animal)
// - Fallback inteligente para buscar animais (repro -> core -> desativa)
// - Filtra vínculos de Prenhe/Seca/etc. e protocolo divergente
// - Agrega tarefas iguais + lista de animais
// -----------------------------------------------------------------------------

import { useCallback, useMemo, useRef, useState } from "react";
import {
  getCalendarManualEvents,
  getCalendarAutoEvents,
  createCalendarEvent,
} from "@/api";
import api from "../../api";

/* ============== util datas ============== */
const pad2 = (n) => String(n).padStart(2, "0");
const toISO = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
};
const addDaysISO = (iso, inc) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + Number(inc || 0));
  return toISO(dt);
};
const brToISO = (ddmmyyyy) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(ddmmyyyy || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/* ============== categorias ============== */
export const TIPOS = [
  "parto",
  "secagem",
  "preparto",
  "vacina",
  "exame",
  "limpeza",
  "estoque",
  "checkup",
  "dispositivo",
  "hormonio",
  "tratamento",
  "protocolo",
];
export const DEFAULT_CATS = Object.fromEntries(TIPOS.map((t) => [t, true]));

const ACAO_TO_TIPO = {
  "Inserir Dispositivo": "dispositivo",
  "Retirar Dispositivo": "dispositivo",
  Inseminação: "protocolo",
};

/* ============== helpers ============== */
const getId = (obj) =>
  obj?.id ?? obj?.uuid ?? obj?.ID ?? obj?.animal_id ?? null;

function normalizeEtapas(maybe) {
  if (!maybe) return [];
  if (Array.isArray(maybe)) return maybe;
  if (typeof maybe === "string") {
    try {
      const arr = JSON.parse(maybe);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  if (typeof maybe === "object" && maybe != null) {
    const flat = [];
    Object.entries(maybe).forEach(([k, v]) => {
      if (Array.isArray(v)) v.forEach((x) => flat.push({ ...(x || {}), dia: x?.dia ?? Number(k) }));
    });
    if (flat.length) return flat;
  }
  return [];
}

const pick = (v, ...paths) => {
  for (const p of paths) {
    const parts = String(p).split(".").filter(Boolean);
    let cur = v, ok = true;
    for (const k of parts) {
      if (cur == null) { ok = false; break; }
      cur = cur?.[k.replace("?", "")];
    }
    if (ok && cur != null) return cur;
  }
  return undefined;
};

/* ============== fetchers ============== */
async function fetchAllProtocols() {
  try {
    const { data } = await api.get("/api/v1/reproducao/protocolos", { params: { limit: 200 } });
    const bruto =
      (Array.isArray(data?.items) && data.items) ||
      (Array.isArray(data?.data) && data.data) ||
      (Array.isArray(data) && data) ||
      [];
    return bruto.map((p) => ({
      ...p,
      id: getId(p),
      etapas: normalizeEtapas(p?.etapas),
      tipo: String(p?.tipo || "").toUpperCase(),
    }));
  } catch (e) {
    console.error("[Calendário] Falha ao listar protocolos:", e?.response?.status || e?.message);
    return [];
  }
}

async function fetchVinculosForProtocol(protId, { refDateISO, statusAtivo = true } = {}) {
  if (!protId) return { items: [], meta: {} };
  try {
    const params = {};
    if (statusAtivo) params.status = "ATIVO";
    if (refDateISO) params.ref_date = refDateISO;
    const { data } = await api.get(`/api/v1/reproducao/protocolos/${protId}/vinculos`, { params });
    const items = (Array.isArray(data?.items) && data.items) || [];
    const meta = data?.meta || {};
    return { items, meta };
  } catch (e) {
    console.warn(`[Calendário] Vínculos falharam p/ protocolo ${protId}:`, e?.response?.status || e?.message);
    return { items: [], meta: {} };
  }
}

/** ----------------------------------------------------------------------------
 *  DETECÇÃO dinâmica de rotas de animais
 *  - "unknown": ainda não sabemos; tentamos NA ORDEM: repro -> core
 *  - "repro":   /api/v1/reproducao/animais/:id
 *  - "core":    /api/v1/animais/:id
 *  - "none":    nenhuma rota disponível (pula checagem de status)
 * ---------------------------------------------------------------------------*/
let ANIMAL_API_MODE = "unknown";      // 'unknown' | 'core' | 'repro' | 'none'
let LOGGED_ANIMAL_ROUTE_ONCE = false;

const normalizeAnimal = (raw) => {
  const id =
    getId(raw) ??
    pick(raw, "animal_id", "animalId", "id_animal") ??
    null;

  const numero = raw?.numero ?? raw?.animalNumero ?? pick(raw, "identificador") ?? null;
  const brinco = raw?.brinco ?? raw?.animalBrinco ?? raw?.ear_tag ?? raw?.earTag ?? null;

  const sitRep =
    pick(
      raw,
      "sit_reprodutiva",
      "situacao_reprodutiva",
      "situacaoReprodutiva",
      "status_reprodutivo",
      "stReprodutiva",
      "repro.situacao",
      "repro.status",
      "situacao_rep",
      "situacao_repro",
      "estado"
    ) || "";

  // compat: várias chaves possíveis para o "protocolo atual"
  const protAtual =
    getId(pick(raw, "protocolo", "protocolo_atual", "protocoloAtual", "protocoloAtivo")) ??
    pick(raw, "protocolo_id", "protocolo_id_atual", "protocoloIdAtual", "protocolo_atual_id");

  return { id, numero, brinco, sitRep, protAtual };
};

/** Busca por ID (com fallback de rota) — prioriza /reproducao para evitar 404 do core */
async function fetchAnimalById(id) {
  if (!id && id !== 0) return null;
  const reproPath = `/api/v1/reproducao/animais/${id}`;
  const corePath  = `/api/v1/animais/${id}`;

  const tryPaths =
    ANIMAL_API_MODE === "repro" ? [reproPath]
    : ANIMAL_API_MODE === "core" ? [corePath]
    : [reproPath, corePath];

  for (const path of tryPaths) {
    try {
      const { data } = await api.get(path);
      if (!LOGGED_ANIMAL_ROUTE_ONCE) {
        LOGGED_ANIMAL_ROUTE_ONCE = true;
        // console.info("[Calendário] Usando rota de animal:", path);
      }
      if (ANIMAL_API_MODE === "unknown") {
        ANIMAL_API_MODE = path.includes("/reproducao/") ? "repro" : "core";
      }
      return normalizeAnimal(data);
    } catch (e) {
      if (e?.response?.status === 404) continue; // tenta próxima
      break; // outros erros: não spam
    }
  }
  if (ANIMAL_API_MODE === "unknown") ANIMAL_API_MODE = "none";
  return null;
}

/** Busca status de vários animais por ID (concorrência limitada) */
async function fetchAnimaisStatusPorIds(ids) {
  const byId = new Map();
  const byNumero = new Map();
  const byBrinco = new Map();
  if (!ids?.length) return { byId, byNumero, byBrinco };

  const queue = [...new Set(ids.map(String))];
  const CONC = 6;
  const workers = Array.from({ length: CONC }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const a = await fetchAnimalById(id);
      if (a?.id != null) byId.set(String(a.id), a);
      if (a?.numero != null) byNumero.set(String(a.numero), a);
      if (a?.brinco) byBrinco.set(String(a.brinco), a);
    }
  });
  await Promise.all(workers);
  return { byId, byNumero, byBrinco };
}

/* ------------------- monta eventos por vínculo ------------------- */
function buildEventsFromVinculo({ protocolo, vinculo, rangeStart, rangeEnd }) {
  const etapas = normalizeEtapas(protocolo?.etapas);
  if (!etapas.length) return [];

  const rawStart = vinculo?.data_inicio || vinculo?.dataInicio || vinculo?.inicio;
  if (!rawStart) return [];
  const isoStart = String(rawStart).includes("/") ? brToISO(rawStart) : String(rawStart).slice(0, 10);
  if (!isoStart) return [];

  const animalId = vinculo?.animal_id || vinculo?.animalId || vinculo?.id_animal || null;
  const animalNumero = vinculo?.numero ?? vinculo?.animalNumero ?? null;
  const animalBrinco = vinculo?.brinco ?? vinculo?.animalBrinco ?? null;

  const tipoRaw = String(protocolo?.tipo || "").toUpperCase();
  const protocoloTipo = tipoRaw === "IATF" ? "IATF" : "Pré-sincronização";

  const events = etapas.map((et, idx) => {
    const off = Number.isFinite(+et?.dia) ? +et.dia : idx;
    const diaISO = addDaysISO(isoStart, off);
    const hasH = !!et?.hormonio;
    const hasA = !!et?.acao;
    const title =
      hasH && hasA ? `Aplicar ${et.hormonio} • ${et.acao}` :
      hasH ? `Aplicar ${et.hormonio}` :
      hasA ? et.acao : `Etapa ${idx + 1}`;
    const tipo = hasH ? "hormonio" : ACAO_TO_TIPO[et?.acao] || "protocolo";

    const groupKey = ["PROTO", protocoloTipo, tipo, title, diaISO, et?.hora || ""].join("|");

    return {
      id: `prot-${protocolo?.id || "p"}-${animalId || "a"}-D${off}`,
      start: diaISO,
      end: diaISO,
      allDay: true,
      tipo,
      title,
      prioridadeVisual: true,
      origem: "protocolo",
      protocoloId: protocolo?.id,
      protocoloNome: protocolo?.nome,
      protocoloTipo,
      etapaDia: off,
      hora: et?.hora || null,
      // animal
      animalId,
      animalNumero,
      animalBrinco,
      groupKey,
    };
  });

  if (!rangeStart || !rangeEnd) return events;
  return events.filter((ev) => ev.start >= rangeStart && ev.start < rangeEnd);
}

/* ===================================================================== */
/*                             Hook Principal                            */
/* ===================================================================== */
export default function useBuscadeCalendario() {
  const [manuais, setManuais] = useState([]);
  const [auto, setAuto] = useState([]);

  const [categorias, setCategorias] = useState(DEFAULT_CATS);
  const [mostrarRotineiros, setMostrarRotineiros] = useState(false);

  const rangeRef = useRef({ start: null, end: null });
  const busyRef = useRef(false); // evita chamadas concorrentes/duplicadas

  const setRangeAndRefresh = useCallback(async ({ start, end }) => {
    if (!start || !end || busyRef.current) return;
    busyRef.current = true;
    rangeRef.current = { start, end };

    try {
      // 1) eventos persistidos
      const [m, a] = await Promise.all([
        getCalendarManualEvents({ start, end }),
        getCalendarAutoEvents({ start, end }),
      ]);
      const man = Array.isArray(m) ? m : [];
      const au = Array.isArray(a) ? a : [];

      // 2) protocolos + vínculos (somente ativos)
      const protocolos = await fetchAllProtocols();
      const refDateISO = start;
      const protWithVinculos = await Promise.all(
        protocolos.map(async (p) => {
          const { items, meta } = await fetchVinculosForProtocol(p.id, { refDateISO, statusAtivo: true });
          return { protocolo: p, vinculos: items, meta };
        })
      );

      // 3) IDs únicos de animais (para buscar por ID se possível)
      const idsUnicos = [];
      protWithVinculos.forEach(({ vinculos }) => {
        (vinculos || []).forEach((v) => {
          const aid = v?.animal_id || v?.animalId || v?.id_animal;
          if (aid != null) idsUnicos.push(String(aid));
        });
      });

      // 4) Status atual dos animais (rota por ID; se nada disponível -> 'none')
      const { byId, byNumero, byBrinco } =
        ANIMAL_API_MODE === "none" ? { byId: new Map(), byNumero: new Map(), byBrinco: new Map() }
        : await fetchAnimaisStatusPorIds(idsUnicos);

      const isInapto = (a) => {
        const s = String(a?.sitRep || "").toLowerCase();
        return (
          s.includes("pren") ||   // prenhe
          s.includes("gest") ||   // gestante
          s.includes("seca") ||
          s.includes("descart") ||
          s.includes("morta") ||
          s.includes("vend")
        );
      };

      // 5) Deriva eventos, filtrando pelos dados reais (se disponíveis)
      const derivados = [];
      protWithVinculos.forEach(({ protocolo, vinculos }) => {
        (vinculos || []).forEach((v) => {
          const aid = v?.animal_id || v?.animalId || v?.id_animal;
          const num = v?.numero ?? v?.animalNumero;
          const brc = v?.brinco ?? v?.animalBrinco;

          const a =
            (aid != null && byId.get(String(aid))) ||
            (num != null && byNumero.get(String(num))) ||
            (brc ? byBrinco.get(String(brc)) : null) ||
            null;

          if (a) {
            if (isInapto(a)) return; // prenhe/seca/etc.: ignora eventos derivados
            const protAtualId = a?.protAtual ? String(a.protAtual) : null;
            if (protAtualId && protocolo?.id && String(protocolo.id) !== protAtualId) return; // protocolo divergente
          }

          const evs = buildEventsFromVinculo({ protocolo, vinculo: v, rangeStart: start, rangeEnd: end });
          if (evs.length) derivados.push(...evs);
        });
      });

      setManuais(man);
      setAuto([...au, ...derivados]);
    } catch (e) {
      console.error("[Calendário] Falha geral ao carregar:", e);
      setManuais([]);
      setAuto([]);
    } finally {
      busyRef.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    const { start, end } = rangeRef.current || {};
    if (start && end) await setRangeAndRefresh({ start, end });
  }, [setRangeAndRefresh]);

  // AGREGA tarefas iguais e ANEXA a lista de animais
  const eventos = useMemo(() => {
    const base = [...auto, ...manuais];

    const map = new Map();
    for (const ev of base) {
      const key =
        ev.groupKey ||
        [
          ev.tipo || "",
          ev.title || "",
          String(ev.start || "").slice(0, 10),
          ev.hora || "",
          ev.protocoloTipo || "",
        ].join("|");

      if (!map.has(key)) {
        map.set(key, { ...ev, id: key, animais: [] });
      }
      const agg = map.get(key);

      const num = ev.animalNumero ?? null;
      const brc = ev.animalBrinco ?? null;
      const aid = ev.animalId ?? null;
      if (num != null || brc != null || aid != null) {
        const exists = agg.animais.some(
          (a) => (a.id && aid && a.id === aid) || (a.numero === num && a.brinco === brc)
        );
        if (!exists) agg.animais.push({ id: aid, numero: num, brinco: brc });
      }
    }

    return [...map.values()].filter(
      (ev) => categorias[ev.tipo] && ((ev.prioridadeVisual ?? true) || mostrarRotineiros)
    );
  }, [auto, manuais, categorias, mostrarRotineiros]);

  const overview = useMemo(() => {
    const { start, end } = rangeRef.current || {};
    const inRange = (ev) =>
      start && end && String(ev.start || "") >= start && String(ev.start || "") < end;
    const base = eventos.filter(inRange);
    const porTipo = Object.fromEntries(TIPOS.map((t) => [t, 0]));
    base.forEach((ev) => { if (porTipo[ev.tipo] != null) porTipo[ev.tipo] += 1; });
    const total = base.length || 0;
    const barras = TIPOS.map((t) => ({
      tipo: t,
      qtd: porTipo[t],
      pct: total ? Math.round((porTipo[t] * 100) / total) : 0,
    })).filter((b) => b.qtd > 0);
    return { total, barras };
  }, [eventos]);

  const createLembrete = useCallback(
    async (payload) => {
      await createCalendarEvent({ allDay: true, prioridadeVisual: true, ...payload });
      await refresh();
    },
    [refresh]
  );

  // Mantido para rotinas que criam “agenda local”
  const applyProtocolo = useCallback(
    async ({ protocoloId, dataInicioBR, horaInicio, criarAgenda = true }) => {
      const isoStart = brToISO(dataInicioBR);
      if (!isoStart) throw new Error("Data de início inválida (dd/mm/aaaa).");

      const { data } = await api.get(`/api/v1/reproducao/protocolos/${protocoloId}`);
      const protocolo = { ...data, id: getId(data), etapas: normalizeEtapas(data?.etapas) };
      const etapas = protocolo.etapas;
      if (!etapas.length) throw new Error("Protocolo sem etapas.");

      const eventosProt = etapas.map((et, i) => {
        const off = Number.isFinite(+et?.dia) ? +et.dia : i;
        const diaISO = addDaysISO(isoStart, off);
        const hasH = !!et?.hormonio;
        const hasA = !!et?.acao;
        const title =
          hasH && hasA ? `Aplicar ${et.hormonio} • ${et.acao}` :
          hasH ? `Aplicar ${et.hormonio}` :
          hasA ? et.acao : `Etapa ${i + 1}`;
        const tipo = hasH ? "hormonio" : ACAO_TO_TIPO[et?.acao] || "protocolo";
        return {
          start: diaISO,
          end: diaISO,
          allDay: true,
          tipo,
          title,
          prioridadeVisual: true,
          origem: "protocolo",
          protocoloId,
          etapaDia: off,
          hora: et?.hora || horaInicio || null,
        };
      });

      for (const ev of eventosProt) await createCalendarEvent(ev);
      if (criarAgenda) await refresh();
      return eventosProt.length;
    },
    [refresh]
  );

  return {
    eventos,
    overview,
    categorias,
    setCategorias,
    mostrarRotineiros,
    setMostrarRotineiros,
    setRangeAndRefresh,
    refresh,
    createLembrete,
    applyProtocolo,
  };
}
