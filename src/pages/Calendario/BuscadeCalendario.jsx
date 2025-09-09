// src/pages/Calendario/BuscadeCalendario.jsx
// -----------------------------------------------------------------------------
// Hook do Calendário – feed orquestrado + lembretes manuais
// -----------------------------------------------------------------------------

import { useCallback, useMemo, useRef, useState } from "react";
import { createCalendarEvent } from "@/api";
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
const getId = (obj) => obj?.id ?? obj?.uuid ?? obj?.ID ?? obj?.animal_id ?? null;

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

/* ============== fetchers ============== */
// Consumimos o feed orquestrado do backend
async function fetchReproCalendarFeed({ start, end }) {
  const { data } = await api.get("/api/v1/reproducao/calendario", { params: { start, end } });
  const itens = Array.isArray(data?.itens) ? data.itens : [];
  return itens;
}

/* ===================================================================== */
/*                             Hook Principal                            */
/* ===================================================================== */
export default function useBuscadeCalendario() {
  const [manuais, setManuais] = useState([]); // lembretes manuais
  const [feed, setFeed] = useState([]); // itens do orquestrador

  const [categorias, setCategorias] = useState(DEFAULT_CATS);
  const [mostrarRotineiros, setMostrarRotineiros] = useState(false);

  const rangeRef = useRef({ start: null, end: null });
  const busyRef = useRef(false); // evita chamadas concorrentes/duplicadas

  const setRangeAndRefresh = useCallback(async ({ start, end }) => {
    if (!start || !end || busyRef.current) return;
    busyRef.current = true;
    rangeRef.current = { start, end };

    try {
      // 1) lembretes manuais
      const m = await getManualsSafe({ start, end });
      // 2) feed do orquestrador
      const itens = await fetchReproCalendarFeed({ start, end });
      setManuais(m);
      setFeed(itens);
    } catch (e) {
      console.error("[Calendário] Falha geral ao carregar:", e);
      setManuais([]);
      setFeed([]);
    } finally {
      busyRef.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    const { start, end } = rangeRef.current || {};
    if (start && end) await setRangeAndRefresh({ start, end });
  }, [setRangeAndRefresh]);

  // Wrapper para manter compat com código antigo
  async function getManualsSafe({ start, end }) {
    try {
      const { getCalendarManualEvents } = await import("@/api");
      const m = await getCalendarManualEvents({ start, end });
      return Array.isArray(m) ? m : [];
    } catch {
      return [];
    }
  }

  // Mapper: feed -> evento FullCalendar
  function mapFeedItemToEvent(it) {
    const d = String(it?.data || "").slice(0, 10);
    let tipo = "protocolo";
    const t = String(it?.tipo || "").toUpperCase();
    if (t === "PROTOCOLO_ETAPA") {
      const hasH = !!(it?.detalhes?.hormonio);
      tipo = hasH ? "hormonio" : "protocolo";
    } else if (t === "TRATAMENTO") {
      tipo = "tratamento";
    } else if (t === "PREV_DG30" || t === "PREV_DG60") {
      tipo = "exame";
    } else if (t === "PRE_PARTO_INICIO") {
      tipo = "preparto";
    } else if (t === "PARTO_PREVISTO") {
      tipo = "parto";
    } else if (t === "SECAGEM") {
      tipo = "secagem";
    }
    const title =
      it?.detalhes?.acao ? it.detalhes.acao :
      it?.detalhes?.hormonio ? `Aplicar ${it.detalhes.hormonio}` :
      it?.origem_protocolo ? `Protocolo ${it.origem_protocolo}` :
      it?.resultado ? `DG ${it.resultado}` :
      t;
    return {
      id: it.id || `${t}-${d}-${it?.animal_id || "x"}`,
      start: d,
      end: d,
      allDay: true,
      tipo,
      title,
      prioridadeVisual: true,
      // extras úteis
      animalId: it.animal_id ?? null,
      protocoloId: it.protocolo_id ?? null,
      aplicacaoId: it.aplicacao_id ?? it.parent_aplicacao_id ?? null,
      refIa: it.ref_ia ?? it.detalhes?.ia_ref_id ?? null,
    };
  }

  // AGREGA tarefas iguais e ANEXA a lista de animais
  const eventos = useMemo(() => {
    const baseFeed = (feed || []).map(mapFeedItemToEvent);
    const base = [...baseFeed, ...manuais];

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
  }, [feed, manuais, categorias, mostrarRotineiros]);

  const overview = useMemo(() => {
    const { start, end } = rangeRef.current || {};
    const inRange = (ev) =>
      start && end && String(ev.start || "") >= start && String(ev.start || "") < end;
    const base = eventos.filter(inRange);
    const porTipo = Object.fromEntries(TIPOS.map((t) => [t, 0]));
    base.forEach((ev) => {
      if (porTipo[ev.tipo] != null) porTipo[ev.tipo] += 1;
    });
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

