// src/pages/Animais/Secagem.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Select from "react-select";
import api, { getAnimais } from "../../api";

export const iconeSecagem = "/icones/secagem.png";
export const rotuloSecagem = "Secagem";

/* ===================== Configurações ===================== */
const KEY_JANELA = "secagem_janela_dias";      // janela (dias à frente)
const KEY_ANTEC  = "secagem_dias_antes_parto"; // antecedência (dias antes do parto)
const JANELA_PADRAO = 60;
const ANTEC_PADRAO  = 60;
const MARGEM_ALERTA = 5;
const STICKY_OFFSET = 48;

/* ===================== Datas/util ===================== */
const DAY = 86400000;

// Parser robusto igual ao usado no Pré-parto
function parseDate(any) {
  if (!any) return null;
  if (any instanceof Date && Number.isFinite(any.getTime())) return any;

  if (typeof any === "number") {
    const ms = any > 1e12 ? any : any * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  if (typeof any === "string") {
    const s = any.trim();

    // dd/mm/aaaa
    const mBR = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (mBR) {
      const dd = Number(mBR[1]); const mm = Number(mBR[2]); const yyyy = Number(mBR[3]);
      const d = new Date(yyyy, mm - 1, dd);
      return Number.isFinite(d.getTime()) ? d : null;
    }

    // yyyy-mm-dd ou ISO completo
    const d2 = new Date(s);
    return Number.isFinite(d2.getTime()) ? d2 : null;
  }

  return null;
}
function toISODateLocal(dt) {
  const d = parseDate(dt);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function formatBR(dt){ return dt ? dt.toLocaleDateString("pt-BR") : "—"; }
function addDays(dt, n){ const d = new Date(parseDate(dt).getTime()); d.setDate(d.getDate()+n); return d; }
function subDays(dt, n){ const d = new Date(parseDate(dt).getTime()); d.setDate(d.getDate()-n); return d; }
function idadeTexto(nasc){
  const dt = parseDate(nasc); if (!dt) return "—";
  const meses = Math.max(0, Math.floor((Date.now()-dt.getTime())/(1000*60*60*24*30.44)));
  return `${Math.floor(meses/12)}a ${meses%12}m`;
}
function diasDesde(val){
  const dt = parseDate(val); if (!dt) return "—";
  return String(Math.max(0, Math.round((Date.now()-dt.getTime())/DAY)));
}
const fmtDigitDate = (v) => {
  const s = String(v || "").replace(/\D/g, "").slice(0, 8);
  return [s.slice(0,2), s.slice(2,4), s.slice(4,8)].filter(Boolean).join("/");
};

/* ===================== Settings (fallback local) ===================== */
const SETTINGS_FLAG = "SETTINGS:API:DISABLED";
const isSettingsApiDisabled = () =>
  window.__SETTINGS_API_DISABLED__ === true ||
  localStorage.getItem(SETTINGS_FLAG) === "1";
const disableSettingsApi = () => {
  try { localStorage.setItem(SETTINGS_FLAG, "1"); } catch {}
  window.__SETTINGS_API_DISABLED__ = true;
};

async function getSetting(key) {
  if (!isSettingsApiDisabled()) {
    try {
      const r = await api.get(`/api/v1/settings/${key}`);
      return r?.data?.value ?? null;
    } catch (e) {
      if (e?.response?.status === 404) disableSettingsApi();
    }
  }
  try {
    const raw = localStorage.getItem(`SETTINGS:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
async function setSetting(key, value) {
  if (!isSettingsApiDisabled()) {
    try { await api.put(`/api/v1/settings/${key}`, { value }); return; }
    catch (e) { if (e?.response?.status === 404) disableSettingsApi(); }
  }
  try { localStorage.setItem(`SETTINGS:${key}`, JSON.stringify(value)); } catch {}
}

/* ===================== Estilos ===================== */
const tableClasses = "w-full border-separate [border-spacing:0_4px] text-[14px] text-[#333] table-auto";
const thBase = "bg-[#e6f0ff] px-3 py-3 text-left font-bold text-[16px] text-[#1e3a8a] border-b-2 border-[#a8c3e6] sticky z-10 whitespace-nowrap cursor-pointer";
const tdBase = "px-4 py-2 border-b border-[#eee] whitespace-nowrap transition-transform";
const tdClamp = tdBase + " overflow-hidden text-ellipsis";
const rowBase = "bg-white shadow-xs transition-colors";
const rowAlt  = "even:bg-[#f7f7f8]";
const bgHL = "bg-[rgba(33,150,243,0.08)]";
const ringCell = "relative z-[1] ring-1 ring-[#1e3a8a]/30 shadow-sm scale-[1.01]";

/* ================== Modal Secagem ================== */
function ModalSecagem({ animal, antec, onClose, onSaved }) {
  const [data, setData] = useState("");
  const [plano, setPlano] = useState(null);
  const [medicamento, setMedicamento] = useState(null);
  const [responsavel, setResponsavel] = useState(null);
  const [principioAtivo, setPrincipioAtivo] = useState("");
  const [carenciaLeite, setCarenciaLeite] = useState("");
  const [carenciaCarne, setCarenciaCarne] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const refData = useRef(null);
  const refPlano = useRef(null);
  const refResp  = useRef(null);
  const refMed   = useRef(null);
  const refPA    = useRef(null);
  const refLeite = useRef(null);
  const refCarne = useRef(null);
  const refObs   = useRef(null);

  const focusOrder = [refData, refPlano, refResp, refMed, refPA, refLeite, refCarne, refObs];
  const focusAt = (i) => { const r = focusOrder[(i+focusOrder.length)%focusOrder.length]?.current; if (r?.focus) r.focus(); };
  const handleKD = (idx) => (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose?.(); return; }
    if (e.key === "Enter")  { e.preventDefault(); (idx === focusOrder.length - 1) ? salvar() : focusAt(idx + 1); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); focusAt(idx + 1); }
    if (e.key === "ArrowUp")   { e.preventDefault(); focusAt(idx - 1); }
  };

  const planoOptions = [
    { value: "antibiotico", label: "Antibiótico intramamário" },
    { value: "antibio_antiinf", label: "Antibiótico + Antiinflamatório" },
  ];
  const [medOptions]  = useState([]);
  const [respOptions] = useState([]);

  const selectStyles = { container: (b) => ({ ...b, marginTop: 6 }), menuPortal: (b) => ({ ...b, zIndex: 99999 }) };

  // Pré-preencher data com a PREVISÃO DE SECAGEM quando existir
  useEffect(() => {
    const prevISO = animal?._secagemPrev;
    const dt = parseDate(prevISO);
    if (dt) setData(dt.toLocaleDateString("pt-BR"));
  }, [animal]);

  // Preview: diferença até o parto, se tiver previsao_parto / previsaoParto
  const previewDiasAntesParto = useMemo(() => {
    try {
      const dt = parseDate(data);
      const pp =
        parseDate(animal?.previsao_parto) ||
        parseDate(animal?.previsaoParto) ||
        parseDate(animal?.previsaoPartoISO);
      if (!dt || !pp) return null;
      return Math.round((pp.getTime() - dt.getTime()) / DAY);
    } catch { return null; }
  }, [data, animal?.previsao_parto, animal?.previsaoParto, animal?.previsaoPartoISO]);

  const salvar = async () => {
    if (!data || !plano?.value) { setErro("Preencha Data e Plano."); return; }
    const dt = parseDate(data);
    if (!dt) { setErro("Data inválida (use dd/mm/aaaa)."); return; }

    setErro(""); setSaving(true);
    try {
      const dataISO = toISODateLocal(dt);

      const detalhes = {
        plano: plano.value,
        medicamento: medicamento?.value || undefined,
        responsavel: responsavel?.value || undefined,
        principio_ativo: principioAtivo || undefined,
        carencia_leite: carenciaLeite || undefined,
        carencia_carne: carenciaCarne || undefined,
        obs: observacoes || undefined,
        antec: Number.isFinite(+antec) ? +antec : undefined,
      };

      await api.post("/api/v1/reproducao/secagem", {
        animal_id: animal.id,
        data: dataISO,
        detalhes,
      });

      onSaved?.();
      onClose?.();

      window.dispatchEvent(new Event("animaisAtualizados"));
      window.dispatchEvent(new Event("atualizarCalendario"));
    } catch (e) {
      console.error("Erro ao salvar secagem:", e);
      alert("❌ Erro ao salvar secagem.");
    } finally { setSaving(false); }
  };

  const onOverlayDown = (e) => { if (e.target === e.currentTarget) onClose?.(); };

  return (
    <div style={overlay} onMouseDown={onOverlayDown}>
      <div style={modal} onMouseDown={(e)=>e.stopPropagation()}>
        <div style={header}>🧪 Secagem — Nº {animal?.numero} • Brinco {animal?.brinco ?? "—"}</div>

        <div style={{ padding: "1.2rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "70vh", overflowY: "auto" }}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-medium">Data *</label>
              <input
                ref={refData}
                value={data}
                onChange={(e) => setData(fmtDigitDate(e.target.value))}
                onKeyDown={handleKD(0)}
                placeholder="dd/mm/aaaa"
                className="w-full px-3 py-2 rounded border border-gray-300"
              />
              <div className="text-xs text-gray-600 mt-1">
                {previewDiasAntesParto != null
                  ? <>≈ <strong>{previewDiasAntesParto}</strong> dias antes do parto</>
                  : <>Preencha a data para ver o intervalo até o parto.</>}
              </div>
            </div>
            <div>
              <label className="font-medium">Plano *</label>
              <Select
                ref={refPlano}
                options={planoOptions}
                value={plano}
                onChange={setPlano}
                onKeyDown={handleKD(1)}
                isClearable
                isSearchable
                classNamePrefix="rs"
                menuPortalTarget={document.body}
                styles={selectStyles}
                placeholder="Selecione…"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-medium">Responsável</label>
              <Select
                ref={refResp}
                options={respOptions}
                value={responsavel}
                onChange={setResponsavel}
                onKeyDown={handleKD(2)}
                isClearable
                isSearchable
                classNamePrefix="rs"
                menuPortalTarget={document.body}
                styles={selectStyles}
                placeholder="Selecione… (opcional)"
              />
            </div>
            <div>
              <label className="font-medium">Medicamento (nome comercial)</label>
              <Select
                ref={refMed}
                options={medOptions}
                value={medicamento}
                onChange={(opt) => {
                  setMedicamento(opt);
                  if (opt?.meta) {
                    setPrincipioAtivo(opt.meta.principioAtivo || "");
                    setCarenciaLeite(opt.meta.carenciaLeite || "");
                    setCarenciaCarne(opt.meta.carenciaCarne || "");
                  }
                }}
                onKeyDown={handleKD(3)}
                isClearable
                isSearchable
                classNamePrefix="rs"
                menuPortalTarget={document.body}
                styles={selectStyles}
                placeholder="Selecione… (opcional)"
              />
            </div>

            <div>
              <label className="font-medium">Princípio ativo</label>
              <input ref={refPA} value={principioAtivo} onChange={(e) => setPrincipioAtivo(e.target.value)} onKeyDown={handleKD(4)} className="w-full px-3 py-2 rounded border border-gray-300" />
            </div>
            <div>
              <label className="font-medium">Carência (leite)</label>
              <input ref={refLeite} value={carenciaLeite} onChange={(e) => setCarenciaLeite(e.target.value)} onKeyDown={handleKD(5)} className="w-full px-3 py-2 rounded border border-gray-300" />
            </div>
            <div>
              <label className="font-medium">Carência (carne)</label>
              <input ref={refCarne} value={carenciaCarne} onChange={(e) => setCarenciaCarne(e.target.value)} onKeyDown={(e)=>handleKD(6)(e)} className="w-full px-3 py-2 rounded border border-gray-300" />
            </div>
          </div>

          <div>
            <label className="font-medium">Observações</label>
            <textarea ref={refObs} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} onKeyDown={(e)=>handleKD(7)(e)} rows={3} className="w-full px-3 py-2 rounded border border-gray-300" />
          </div>

          {erro && <div className="text-red-600 font-medium">{erro}</div>}

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={onClose} className="px-4 py-2 rounded border border-gray-300">Cancelar</button>
            <button onClick={salvar} disabled={saving} className="px-4 py-2 rounded bg-blue-600 text-white">
              {saving ? "Salvando…" : "Aplicar Secagem"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== estilos modal ===== */
const overlay = { position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 };
const modal   = { background: "#fff", borderRadius: "1rem", width: "760px", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "Poppins, sans-serif" };
const header  = { background: "#1e40af", color: "white", padding: "1rem 1.5rem", fontWeight: "bold", fontSize: "1.1rem" };

/* ================== Lista Secagem ================== */
export default function Secagem({ animais = [], onCountChange }) {
  // JANELA = filtro (em quantos dias à frente quero ver secagens)
  const [janela, setJanela] = useState(null);
  const [janelaRaw, setJanelaRaw] = useState("");

  // ANTECEDÊNCIA = quantos dias antes do parto ocorre a secagem (regra)
  const [antec, setAntec] = useState(ANTEC_PADRAO);

  const [lista, setLista] = useState(Array.isArray(animais) ? animais : []);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  // estados de hover
  const [hoverCol, setHoverCol] = useState(null);
  const [hoverRow, setHoverRow] = useState(null);
  const [hoverCell, setHoverCell] = useState({ r: null, c: null });
  const [modalAnimal, setModalAnimal] = useState(null);

  /* 1) Carrega preferências (janela e antecedência) */
  useEffect(() => {
    let alive = true;
    (async () => {
      const j = Number(await getSetting(KEY_JANELA));
      const a = Number(await getSetting(KEY_ANTEC));
      const J = Number.isFinite(j) && j > 0 ? j : JANELA_PADRAO;
      const A = Number.isFinite(a) && a > 0 ? a : ANTEC_PADRAO;
      if (alive) {
        setJanela(J); setJanelaRaw(String(J));
        setAntec(A);
      }
    })();
    return () => { alive = false; };
  }, []);

  /* 2) Salva janela quando confirmar */
  const commitJanela = useCallback(async () => {
    const n = Math.max(1, Math.min(365, parseInt(janelaRaw, 10) || 1));
    setJanelaRaw(String(n));
    if (n !== janela) {
      setJanela(n);
      await setSetting(KEY_JANELA, n);
    }
  }, [janelaRaw, janela]);

  /* 3) Carrega lista a partir do feed de calendário (SECAGEM_PREVISTA) */
  const fetchLista = useCallback(async () => {
    if (janela == null) return;
    setLoading(true); setErro("");
    try {
      const hoje = new Date();
      const startISO = toISODateLocal(subDays(hoje, MARGEM_ALERTA));
      const endISO = toISODateLocal(addDays(hoje, janela));

      const { data: calData } = await api.get("/api/v1/reproducao/calendario", { params: { start: startISO, end: endISO } });

      const itens = Array.isArray(calData?.itens) ? calData.itens : [];
      const feed = itens.filter((it) => {
        // aceita várias grafias de tipo: "SECAGEM_PREVISTA", "secagem_prevista", "SECAGEM", etc.
        const tipo = String(it?.tipo || it?.evento || it?.kind || "")
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .toUpperCase();
        return tipo.includes("SECAGEM"); // basta conter SECAGEM
      });

      // pega a data do evento (aceita vários campos e formatos)
      const normData = (it) => {
        const cand =
          it?.data ?? it?.start ?? it?.inicio ?? it?.date ?? it?.data_inicio ?? it?.dataISO ?? it?.start_date ?? null;
        return toISODateLocal(parseDate(cand)); // guarda ISO yyyy-mm-dd
      };

      // id do animal (aceita várias chaves)
      const normId = (it) => String(
        it?.animal_id ?? it?.animalId ?? it?.id_animal ?? it?.animal?.id ?? it?.dados?.animal_id ?? ""
      );

      const ids = [];
      const mapa = new Map();
      for (const it of feed) {
        const id = normId(it);
        const iso = normData(it);
        if (!id || !iso) continue;
        ids.push(id);
        mapa.set(id, { ...it, _iso: iso });
      }

      const { items } = await getAnimais({ view: "plantel", page: 1, limit: 2000 });

      const base = (items || [])
        .filter((a) => ids.includes(String(a.id)))
        .map((a) => {
          const ci = mapa.get(String(a.id));
          return {
            ...a,
            // data prevista de secagem (ISO)
            _secagemPrev: ci?._iso || null,
            // deixe acessível a previsão de parto em múltiplas chaves para o preview
            previsao_parto: a?.previsao_parto ?? a?.previsaoParto ?? a?.previsaoPartoISO ?? null,
            previsaoParto:  a?.previsaoParto  ?? a?.previsao_parto ?? a?.previsaoPartoISO ?? null,
            previsaoPartoISO: a?.previsaoPartoISO ?? null,
          };
        });

      setLista(base);
    } catch (e) {
      console.error("Erro ao carregar secagem:", e);
      setErro("Não foi possível carregar do servidor. Mostrando dados locais.");
      setLista(Array.isArray(animais) ? animais : []);
    } finally {
      setLoading(false);
    }
  }, [janela, animais]);

  useEffect(() => { fetchLista(); }, [fetchLista]);
  useEffect(() => {
    const h = () => fetchLista();
    window.addEventListener("animaisAtualizados", h);
    return () => window.removeEventListener("animaisAtualizados", h);
  }, [fetchLista]);

  // ===== helpers de estado/visibilidade =====
  const hoje = new Date();

  const getSitProd = (v) =>
    String(v?.situacao_produtiva ?? v?.situacaoProdutiva ?? v?.sit_produtiva ?? v?.estado ?? "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const isJaSeca = (v) => {
    const sp = getSitProd(v);
    if (sp.includes("seca")) return true;
    const sec = v?.historico?.secagens;
    return Array.isArray(sec) && sec.length > 0;
  };
  const ehLactanteOuVaca = (v) => {
    const sp = getSitProd(v);
    if (sp.includes("seca")) return false;           // já seca não deve aparecer
    if (sp.includes("lact")) return true;            // lactante/lactacao
    const categoria = String(v?.categoria || "").toLowerCase();
    if (categoria.includes("vaca")) return true;
    const dtParto = parseDate(v?.parto);
    if (dtParto && dtParto < hoje) return true;
    return false;
  };

  function classificarPorJanela(v, J, A) {
    const prevSec = parseDate(v._secagemPrev);
    if (!prevSec) return { bucket: 3, diasAteSec: Infinity, pp: null, prevSec: null };
    const diasAteSec = Math.floor((prevSec.getTime() - hoje.getTime()) / DAY);
    const pp = addDays(prevSec, A);
    if (diasAteSec < -MARGEM_ALERTA) return { bucket: 0, diasAteSec, pp, prevSec }; // atrasada
    if (diasAteSec <= J)             return { bucket: 1, diasAteSec, pp, prevSec }; // dentro da janela
    return { bucket: 2, diasAteSec, pp, prevSec };                                   // antecipada
  }

  const listaOrdenada = useMemo(() => {
    if (!Array.isArray(lista) || janela == null) return [];
    const base = lista.filter(v => !isJaSeca(v) && ehLactanteOuVaca(v));
    const enriched = base.map(v => ({ v, meta: classificarPorJanela(v, janela, antec) }))
      .filter(x => x.meta.bucket !== 2 && x.meta.bucket !== 3); // atrasadas + no prazo
    enriched.sort((a, b) => {
      if (a.meta.bucket !== b.meta.bucket) return a.meta.bucket - b.meta.bucket;
      return a.meta.diasAteSec - b.meta.diasAteSec;
    });
    return enriched;
  }, [lista, janela, antec]);

  // ✅ comunica contagem
  useEffect(() => {
    const count = listaOrdenada.length;
    onCountChange?.("secagem", count);
    try {
      window.dispatchEvent(new CustomEvent("subaba:count", { detail: { key: "secagem", count } }));
    } catch {}
  }, [listaOrdenada.length, onCountChange]);

  const colunas = useMemo(
    () => ["Número","Brinco","Categoria","DEL","Idade","Raça","Prev. Secagem","Prev. Parto","Ação"],
    []
  );

  // helpers de hover
  const enterCell = (r, c) => () => { setHoverRow(r); setHoverCol(c); setHoverCell({ r, c }); };
  const leaveCell = () => { setHoverRow(null); setHoverCell({ r: null, c: null }); };

  return (
    <section className="w-full py-6 font-sans">
      <div className="px-2 md:px-4 lg:px-6">
        <div className="mb-2 flex items-center gap-3">
          <label className="font-semibold text-[#1e3a8a]">Mostrar vacas para secagem em até</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={janelaRaw}
            onChange={(e) => setJanelaRaw(e.target.value)}
            onBlur={commitJanela}
            onKeyDown={(e) => {
              if (e.key === "Enter")  { e.preventDefault(); commitJanela(); e.currentTarget.blur(); }
              if (e.key === "Escape") { e.preventDefault(); setJanelaRaw(String(janela ?? JANELA_PADRAO)); e.currentTarget.blur(); }
            }}
            className="w-24 px-3 py-2 rounded-md border border-[#1e3a8a] focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]"
          />
          <span className="text-sm text-gray-600">dias</span>

          <div className="ml-auto text-sm">
            {loading
              ? <span className="text-[#1e3a8a]">Carregando…</span>
              : <span className="text-gray-600">Total: <strong>{listaOrdenada.length}</strong></span>}
          </div>
        </div>

        {/* legenda */}
        <div className="mb-4 text-xs text-gray-600">
          <span className="inline-flex items-center mr-3">
            <span className="w-3 h-3 rounded-sm bg-red-500 inline-block mr-1.5"></span>
            Atrasada (secagem já vencida)
          </span>
          <span className="inline-flex items-center mr-3">
            <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block mr-1.5"></span>
            No prazo (até {janela ?? JANELA_PADRAO} dias)
          </span>
          <span className="inline-flex items-center">
            <span className="w-3 h-3 rounded-sm bg-gray-400 inline-block mr-1.5"></span>
            Antecipada (fora da janela) — não exibida
          </span>
        </div>

        {erro && <div className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-300 px-3 py-2 rounded">{erro}</div>}

        <table className={tableClasses}>
          <colgroup>
            <col style={{ width: 70 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              {colunas.map((c, i) => (
                <th
                  key={c}
                  onMouseEnter={() => setHoverCol(i)}
                  onMouseLeave={() => setHoverCol(null)}
                  className={`${thBase} ${hoverCol === i ? bgHL : ""}`}
                  style={{ top: STICKY_OFFSET }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {listaOrdenada.map(({ v, meta }, rIdx) => {
              const numero    = v.numero ?? "—";
              const brinco    = v.brinco ?? "—";
              const categoria = v.categoria ?? "—";
              const del       = diasDesde(v.parto);
              const idade     = idadeTexto(v.nascimento);
              const raca      = v.raca ?? "—";
              const prevSec   = formatBR(meta.prevSec);
              const prevParto = formatBR(meta.pp);

              const bucketClass =
                meta.bucket === 0 ? "bg-red-50 border-l-4 border-red-500 text-red-700"
                : "hover:bg-[#eaf5ff]";

              const TD = (content, cIdx, clamp=true) => {
                const isRowHL = hoverRow === rIdx;
                const isColHL = hoverCol === cIdx;
                const isCellHL = hoverCell.r === rIdx && hoverCell.c === cIdx;
                const klass = `${clamp ? tdClamp : tdBase} ${isRowHL || isColHL ? bgHL : ""} ${isCellHL ? ringCell : ""}`;
                return (
                  <td
                    className={klass}
                    onMouseEnter={enterCell(rIdx, cIdx)}
                    onMouseLeave={leaveCell}
                  >
                    {content}
                  </td>
                );
              };

              return (
                <tr
                  key={v.id ?? rIdx}
                  className={`${rowBase} ${rowAlt} ${bucketClass}`}
                  onMouseEnter={() => setHoverRow(rIdx)}
                  onMouseLeave={() => setHoverRow(null)}
                >
                  {TD(numero, 0)}
                  {TD(brinco, 1)}
                  {TD(categoria, 2)}
                  {TD(del, 3)}
                  {TD(idade, 4)}
                  {TD(raca, 5)}
                  {TD(prevSec, 6)}
                  {TD(prevParto, 7)}
                  <td
                    className={`${tdBase} ${hoverCol === 8 || hoverRow === rIdx ? bgHL : ""} ${hoverCell.r === rIdx && hoverCell.c === 8 ? ringCell : ""}`}
                    onMouseEnter={enterCell(rIdx, 8)}
                    onMouseLeave={leaveCell}
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a] hover:bg-[#1e3a8a]/5"
                      onClick={() => setModalAnimal(v)}
                      title="Aplicar secagem"
                    >
                      Secar
                    </button>
                  </td>
                </tr>
              );
            })}
            {(!loading && listaOrdenada.length === 0) && (
              <tr>
                <td className={tdBase} colSpan={colunas.length}>
                  <div className="text-center text-gray-600 py-6">Nenhum animal com secagem vencida ou prevista na janela.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {modalAnimal && (
          <ModalSecagem
            animal={modalAnimal}
            antec={antec}
            onClose={() => setModalAnimal(null)}
            onSaved={() => {
              setModalAnimal(null);
              fetchLista();
            }}
          />
        )}
      </div>
    </section>
  );
}
