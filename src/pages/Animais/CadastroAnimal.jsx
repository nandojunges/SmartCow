// src/pages/Animais/CadastroAnimal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import { criarAnimal as apiCriarAnimal } from "../../api";

/* ===========================================
   Helpers
=========================================== */
function formatarDataDigitada(valor) {
  const s = String(valor || "").replace(/\D/g, "").slice(0, 8);
  const dia = s.slice(0, 2);
  const mes = s.slice(2, 4);
  const ano = s.slice(4, 8);
  let out = [dia, mes, ano].filter(Boolean).join("/");
  if (out.length === 10) {
    const [d, m, a] = out.split("/").map(Number);
    const dt = new Date(a, (m || 1) - 1, d || 1);
    if (dt.getDate() !== d || dt.getMonth() !== (m - 1) || dt.getFullYear() !== a) {
      out = "";
    }
  }
  return out;
}
function calcularIdadeECategoria(nascimento, sexo) {
  if (!nascimento || nascimento.length !== 10) return { idade: "", categoria: "", meses: 0 };
  const [dia, mes, ano] = nascimento.split("/").map(Number);
  const nascDate = new Date(ano, mes - 1, dia);
  if (isNaN(+nascDate)) return { idade: "", categoria: "", meses: 0 };
  const diffMs = Date.now() - nascDate.getTime();
  const meses = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
  const idade = `${Math.floor(meses / 12)}a ${meses % 12}m`;
  let categoria = "";
  if (meses < 2) categoria = "Bezerro(a)";
  else if (meses < 12) categoria = "Novilho(a)";
  else if (meses < 24) categoria = sexo === "macho" ? "Touro jovem" : "Novilha";
  else categoria = sexo === "macho" ? "Touro" : "Adulto(a)";
  return { idade, categoria, meses };
}
function maskMoedaBR(v) {
  let n = String(v).replace(/\D/g, "");
  n = (parseInt(n || "0", 10) / 100).toFixed(2);
  return n.replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function previsaoPartoISO(ultimaIA) {
  if (!ultimaIA || ultimaIA.length !== 10) return { br: "", iso: "" };
  const [d, m, a] = ultimaIA.split("/").map(Number);
  const dt = new Date(a, m - 1, d);
  if (isNaN(+dt)) return { br: "", iso: "" };
  dt.setDate(dt.getDate() + 283);
  const y = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return { br: `${dd}/${mm}/${y}`, iso: `${y}-${mm}-${dd}` };
}

/* ===========================================
   Componentes de UI simples
=========================================== */
const Pill = ({ children, tone = "info" }) => {
  const tones = {
    info:   { bg:"#eef2ff", fg:"#3730a3", bd:"#c7d2fe" },
    good:   { bg:"#ecfdf5", fg:"#065f46", bd:"#a7f3d0" },
    warn:   { bg:"#fff7ed", fg:"#9a3412", bd:"#fed7aa" },
    bad:    { bg:"#fef2f2", fg:"#991b1b", bd:"#fecaca" },
    mute:   { bg:"#f1f5f9", fg:"#334155", bd:"#e2e8f0" },
  }[tone] || {};
  return (
    <span style={{ background:tones.bg, color:tones.fg, border:`1px solid ${tones.bd}`, padding:"4px 10px", borderRadius:999, fontWeight:700, fontSize:12 }}>
      {children}
    </span>
  );
};

/* =========================================
   Formulário principal v3 (premium)
======================================== */
export default function CadastroAnimal({ animais = [], onAtualizar }) {
  /** Básicos */
  const [numero, setNumero] = useState("");
  const [brinco, setBrinco] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [sexo, setSexo] = useState("");
  const [raca, setRaca] = useState("");
  const [racasAdicionais, setRacasAdicionais] = useState([]);
  const [novaRaca, setNovaRaca] = useState("");

  /** Origem / financeiro */
  const [origem, setOrigem] = useState("propriedade");
  const [valorCompra, setValorCompra] = useState("");

  /** Situações */
  const [categoria, setCategoria] = useState("");
  const [idade, setIdade] = useState("");
  const [mesesIdade, setMesesIdade] = useState(0);
  const [sitProd, setSitProd] = useState("");
  const [sitReprod, setSitReprod] = useState("");

  /** Avançados (sem modal!) */
  const [mostrarAvancados, setMostrarAvancados] = useState(false);
  const [pai, setPai] = useState("");
  const [mae, setMae] = useState("");
  const [ultimaIA, setUltimaIA] = useState("");
  const [ultimoParto, setUltimoParto] = useState("");
  const [nLactacoes, setNLactacoes] = useState("");

  /** Feedback */
  const [mensagemSucesso, setMensagemSucesso] = useState("");
  const [mensagemErro, setMensagemErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  /** Debug detalhado */
  const [detalhesErro, setDetalhesErro] = useState(null);

  /** focus chain */
  const brincoRef = useRef();
  const nascimentoRef = useRef();
  const salvarRef = useRef();
  const refs = [brincoRef, nascimentoRef, salvarRef];

  /* ===== número automático ===== */
  useEffect(() => {
    const maiorNumero = animais.reduce((max, a) => Math.max(max, parseInt(a?.numero || 0, 10)), 0);
    setNumero(String(maiorNumero + 1));
  }, [animais]);

  useEffect(() => { brincoRef.current?.focus(); }, []);

  /* ===== atualiza idade e categoria ===== */
  useEffect(() => {
    const { idade: id, categoria: cat, meses } = calcularIdadeECategoria(nascimento, sexo);
    setIdade(id); setCategoria(cat); setMesesIdade(meses);

    // regra: reprod para fêmeas < 12m
    if (sexo === "femea" && meses < 12) setSitReprod("vazia");

    // produtiva default
    if (sexo === "femea") {
      if (meses < 24 && (sitProd === "" || sitProd === "lactante")) setSitProd("nao_lactante");
    } else if (sexo === "macho") {
      setSitProd("nao_lactante");
      setSitReprod("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nascimento, sexo]);

  /* ===== previsao de parto a partir da IA ===== */
  const { br: prevPartoBR, iso: prevPartoISO } = useMemo(() => previsaoPartoISO(ultimaIA), [ultimaIA]);

  /* ===== selects ===== */
  const sexoOptions = [
    { value: "femea", label: "Fêmea" },
    { value: "macho", label: "Macho" },
  ];
  const racaOptions = [
    { value: "Holandês", label: "Holandês" },
    { value: "Jersey", label: "Jersey" },
    { value: "Girolando", label: "Girolando" },
    ...racasAdicionais.map((r) => ({ value: r, label: r })),
  ];
  const origemOptions = [
    { value: "propriedade", label: "Nascido na propriedade" },
    { value: "comprado", label: "Comprado" },
    { value: "doacao", label: "Doação" },
  ];
  const prodOptions = (sexo === "femea" && mesesIdade >= 24)
    ? [{ value: "lactante", label: "Lactante" }, { value: "seca", label: "Seca" }]
    : [{ value: "nao_lactante", label: "Não lactante" }];
  const reprodOptions = [
    { value: "vazia", label: "Vazia" },
    { value: "inseminada", label: "Inseminada" },
    { value: "prenhe", label: "Prenhe" },
    { value: "pev", label: "PEV (pós-parto)" },
    { value: "descartada", label: "Descarte" },
  ];
  const reprodBloqueada = sexo === "femea" && mesesIdade < 12;

  /* ===== ações ===== */
  const handleEnter = (e, index) => {
    if (e.key === "Enter") {
      const next = refs[index + 1];
      if (next?.current) next.current.focus();
    }
  };
  const adicionarNovaRaca = () => {
    const v = (novaRaca || "").trim();
    if (!v) return;
    if (!racasAdicionais.includes(v)) setRacasAdicionais([...racasAdicionais, v]);
    setRaca(v); setNovaRaca("");
  };

  const limparForm = () => {
    setBrinco(""); setNascimento(""); setSexo(""); setRaca(""); setNovaRaca("");
    setOrigem("propriedade"); setValorCompra("");
    setIdade(""); setCategoria(""); setSitProd(""); setSitReprod("");
    setPai(""); setMae(""); setUltimaIA(""); setUltimoParto(""); setNLactacoes("");
    setMostrarAvancados(false);
    setNumero(String(parseInt(numero || "0", 10) + 1));
  };

  const montarPayload = () => {
    // estado compatível com telas antigas
    let estadoCompat = "vazia";
    if (sitProd === "lactante") estadoCompat = "lactante";
    else if (sitProd === "seca") estadoCompat = "seca";

    // força vazia p/ fêmea < 12m
    const reprodFinal = (sexo === "femea" && mesesIdade < 12) ? "vazia" : (sitReprod || "vazia");

    const payload = {
      // identificação
      numero, brinco, nascimento, raca, sexo, categoria,

      // estados
      estado: estadoCompat,
      situacao_produtiva: sitProd || undefined,
      situacao_reprodutiva: reprodFinal || undefined,

      // origem/financeiro (backend pode ignorar se não existir coluna)
      origem: origem || "propriedade",
      valor_compra: valorCompra || "",

      // genealogia + avançados
      pai: pai || "",
      mae: mae || "",
      n_lactacoes: Number(nLactacoes || 0),
      ultima_ia: ultimaIA || "",
      ultimo_parto: ultimoParto || "",
      parto: ultimoParto || "",
      previsao_parto: prevPartoBR || "",
      previsao_parto_iso: prevPartoISO || undefined,

      // não enviar 'historico' vazio; backend só aceita se houver coluna
      // (se precisar, preencha algo real aqui e deixe o backend decidir)
      // historico: { meta: {} },
    };
    return payload;
  };

  const salvar = async ({ eNovo = false } = {}) => {
    if (!brinco || !nascimento || !raca || !sexo) {
      setMensagemErro("⚠️ Preencha Brinco, Nascimento, Sexo e Raça.");
      setTimeout(() => setMensagemErro(""), 2500);
      return;
    }
    try {
      setSalvando(true);
      setDetalhesErro(null);
      const payload = montarPayload();
      console.dir(payload, { depth: null });

      const inserido = await apiCriarAnimal(payload).catch((err) => {
        const dbg = {
          status: err?.response?.status,
          url: err?.config?.url,
          sent: payload,
          backendError: err?.response?.data?.error,
          message: err?.response?.data?.message,
          tips: err?.response?.data?.tips,
        };
        console.error("⛔ criarAnimal falhou", dbg);
        console.log("↩️ backend data:", err?.response?.data);
        setDetalhesErro(dbg);
        throw err;
      });

      // atualiza lista
      const novo = inserido && typeof inserido === "object" ? inserido : { ...payload };
      onAtualizar?.([...(animais || []), novo]);

      setMensagemSucesso("✅ Animal cadastrado com sucesso!");
      setTimeout(() => setMensagemSucesso(""), 2500);

      if (eNovo) limparForm();
    } catch (err) {
      const msg = err?.response?.data?.message || "❌ Erro no cadastro. Verifique os campos.";
      setMensagemErro(msg);
      setTimeout(() => setMensagemErro(""), 3500);
    } finally {
      setSalvando(false);
    }
  };

  /* ===== layout ===== */
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", fontFamily: "Poppins, system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", margin:"8px 0 16px" }}>
        <div>
          <h1 style={{ margin:0, fontSize:28, fontWeight:900 }}>Entrada de Animal</h1>
          <div style={{ color:"#64748b", fontSize:13 }}>Preencha os campos. Os avançados ficam já aqui, sem modal.</div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button
            style={{ ...botaoGhost, fontWeight:800 }}
            onClick={() => setMostrarAvancados(v=>!v)}
            title="Alternar campos avançados"
          >
            {mostrarAvancados ? "− Esconder avançados" : "➕ Mostrar avançados"}
          </button>
          <button
            style={{ ...botaoPrincipal, minWidth:160 }}
            onClick={() => salvar({ eNovo:false })}
            disabled={salvando}
            ref={salvarRef}
            title="Salvar (Ctrl+S)"
          >
            {salvando ? "Salvando…" : "💾 Salvar"}
          </button>
          <button
            style={{ ...botaoVerde(true), minWidth:160 }}
            onClick={() => salvar({ eNovo:true })}
            disabled={salvando}
            title="Salvar e limpar para novo (Ctrl+Enter)"
          >
            {salvando ? "Aguarde…" : "✅ Salvar e novo"}
          </button>
        </div>
      </div>

      {/* Feedback */}
      {mensagemSucesso && <div style={alertSucesso}>✅ {mensagemSucesso}</div>}
      {mensagemErro && <div style={alertErro}>❌ {mensagemErro}</div>}
      {detalhesErro && (
        <div style={alertErro}>
          <div style={{ fontWeight:800, marginBottom:6 }}>Detalhes técnicos (para depurar 400):</div>
          <pre style={{ whiteSpace:"pre-wrap", margin:0, fontFamily:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}>
{JSON.stringify(detalhesErro, null, 2)}
          </pre>
        </div>
      )}

      {/* Conteúdo em 2 colunas: form + resumo sticky */}
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:18 }}>
        {/* Coluna esquerda (form) */}
        <div>
          {/* Card: Identificação */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={cardTitle}>Identificação</div>
              <Pill tone="mute">campos obrigatórios</Pill>
            </div>

            <div style={grid2}>
              <div>
                <label style={lbl}>Número</label>
                <input type="text" value={numero} readOnly style={inputReadOnly} />
              </div>
              <div>
                <label style={lbl}>Brinco *</label>
                <input
                  type="text" value={brinco} ref={brincoRef}
                  onChange={(e) => setBrinco(e.target.value)}
                  onKeyDown={(e) => handleEnter(e, 0)}
                  style={inputBase} placeholder="Digite o brinco"
                />
              </div>
            </div>

            <div style={{ ...grid2, marginTop: 16 }}>
              <div>
                <label style={lbl}>Nascimento *</label>
                <input
                  type="text" value={nascimento} ref={nascimentoRef}
                  onChange={(e) => setNascimento(formatarDataDigitada(e.target.value))}
                  onKeyDown={(e) => handleEnter(e, 1)}
                  placeholder="dd/mm/aaaa" style={inputBase}
                />
              </div>
              <div>
                <label style={lbl}>Sexo *</label>
                <Select options={sexoOptions} value={sexoOptions.find((opt) => opt.value === sexo) || null}
                        onChange={(e) => setSexo(e.value)} placeholder="Selecione" />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={lbl}>Raça *</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Select options={racaOptions} value={racaOptions.find((opt) => opt.value === raca) || null}
                        onChange={(e) => setRaca(e.value)} placeholder="Selecione" styles={{ container: (base) => ({ ...base, flex: 1 }) }} />
                <input type="text" value={novaRaca} onChange={(e) => setNovaRaca(e.target.value)}
                       placeholder="Nova raça" style={{ ...inputBase, flex: 1 }} />
                <button onClick={adicionarNovaRaca} style={botaoVerde(true)}>Adicionar</button>
              </div>
            </div>
          </div>

          {/* Card: Situação inicial */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={cardTitle}>Situação inicial</div>
              <div style={{ display:"flex", gap:8 }}>
                <Pill tone="mute">Categoria: {categoria || "—"}</Pill>
                <Pill tone="mute">Idade: {idade || "—"}</Pill>
              </div>
            </div>

            <div style={grid2}>
              <div>
                <label style={lbl}>Situação produtiva</label>
                <Select
                  options={prodOptions}
                  value={prodOptions.find(o => o.value === sitProd) || null}
                  onChange={(o) => setSitProd(o?.value || "")}
                  placeholder="Selecione"
                />
                {sexo === "femea" && mesesIdade < 24 && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                    Novilhas ficam como <strong>Não lactante</strong>.
                  </div>
                )}
              </div>

              <div>
                <label style={lbl}>Situação reprodutiva</label>
                <Select
                  isDisabled={reprodBloqueada || sexo !== "femea"}
                  options={reprodOptions}
                  value={reprodOptions.find(o => o.value === (reprodBloqueada ? "vazia" : sitReprod)) || (reprodBloqueada ? reprodOptions[0] : null)}
                  onChange={(o) => setSitReprod(o?.value || "")}
                  placeholder={sexo === "macho" ? "Não aplicável" : "Selecione"}
                />
                {reprodBloqueada && (
                  <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>
                    <strong>Regra:</strong> fêmeas &lt; 12 meses são <strong>vazias</strong>.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card: Origem */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={cardTitle}>Origem do animal</div>
            </div>
            <div style={grid2}>
              <div>
                <label style={lbl}>Origem</label>
                <Select options={origemOptions} value={origemOptions.find((opt) => opt.value === origem) || null}
                        onChange={(e) => setOrigem(e.value)} placeholder="Selecione" />
              </div>
              <div>
                <label style={lbl}>Valor de compra (R$)</label>
                <input type="text" value={valorCompra} onChange={(e) => setValorCompra(maskMoedaBR(e.target.value))}
                       style={inputBase} placeholder="Opcional" />
              </div>
            </div>
          </div>

          {/* Card: Avançados (sem modal) */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={cardTitle}>Campos avançados</div>
              <button style={botaoGhost} onClick={() => setMostrarAvancados(v=>!v)}>
                {mostrarAvancados ? "− Esconder" : "➕ Exibir"}
              </button>
            </div>

            {mostrarAvancados && (
              <>
                <div style={grid2}>
                  <div>
                    <label style={lbl}>Pai (nome)</label>
                    <input style={inputBase} value={pai} onChange={(e)=>setPai(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Mãe (nome)</label>
                    <input style={inputBase} value={mae} onChange={(e)=>setMae(e.target.value)} />
                  </div>
                </div>

                <div style={{ ...grid2, marginTop:16 }}>
                  <div>
                    <label style={lbl}>Última IA</label>
                    <input style={inputBase} placeholder="dd/mm/aaaa"
                           value={ultimaIA} onChange={(e)=>setUltimaIA(formatarDataDigitada(e.target.value))} />
                    {prevPartoBR && (
                      <div style={{ fontSize:12, color:"#64748b", marginTop:6 }}>
                        🍼 Previsão de parto: <strong>{prevPartoBR}</strong>
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={lbl}>Último parto</label>
                    <input style={inputBase} placeholder="dd/mm/aaaa"
                           value={ultimoParto} onChange={(e)=>setUltimoParto(formatarDataDigitada(e.target.value))} />
                  </div>
                  <div>
                    <label style={lbl}>Número de lactações</label>
                    <input style={inputBase} type="number" min="0" value={nLactacoes} onChange={(e)=>setNLactacoes(e.target.value)} />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Ações (duplicadas no topo para ergonomia) */}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:12 }}>
            <button style={botaoGhost} onClick={limparForm}>Limpar</button>
            <button style={botaoPrincipal} onClick={()=>salvar({ eNovo:false })} disabled={salvando}>
              {salvando ? "Salvando…" : "💾 Salvar"}
            </button>
            <button style={botaoVerde(true)} onClick={()=>salvar({ eNovo:true })} disabled={salvando}>
              {salvando ? "Aguarde…" : "✅ Salvar e novo"}
            </button>
          </div>
        </div>

        {/* Coluna direita (Resumo sticky) */}
        <div>
          <div style={{ position:"sticky", top:12 }}>
            <div style={{ ...card, padding:"16px 16px 12px" }}>
              <div style={{ ...cardHeader, marginBottom:6 }}>
                <div style={cardTitle}>Resumo</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:8 }}>
                <div style={rowKV}><span style={k}>Número</span><span style={v}>{numero || "—"}</span></div>
                <div style={rowKV}><span style={k}>Brinco</span><span style={v}>{brinco || "—"}</span></div>
                <div style={rowKV}><span style={k}>Nascimento</span><span style={v}>{nascimento || "—"}</span></div>
                <div style={rowKV}><span style={k}>Sexo</span><span style={v}>{sexo || "—"}</span></div>
                <div style={rowKV}><span style={k}>Raça</span><span style={v}>{raca || "—"}</span></div>
                <div style={{ height:1, background:"#e5e7eb", margin:"4px 0" }} />
                <div style={rowKV}><span style={k}>Categoria</span><span style={v}>{categoria || "—"}</span></div>
                <div style={rowKV}><span style={k}>Idade</span><span style={v}>{idade || "—"}</span></div>
                <div style={{ height:1, background:"#e5e7eb", margin:"4px 0" }} />
                <div style={rowKV}><span style={k}>Produtiva</span><span style={v}>{sitProd || "—"}</span></div>
                <div style={rowKV}><span style={k}>Reprodutiva</span><span style={v}>{(reprodBloqueada ? "vazia" : (sitReprod || "—"))}</span></div>
                <div style={{ height:1, background:"#e5e7eb", margin:"4px 0" }} />
                <div style={rowKV}><span style={k}>Origem</span><span style={v}>{origem}</span></div>
                {valorCompra && <div style={rowKV}><span style={k}>Valor compra</span><span style={v}>R$ {valorCompra}</span></div>}
                {mostrarAvancados && (
                  <>
                    <div style={{ height:1, background:"#e5e7eb", margin:"4px 0" }} />
                    <div style={rowKV}><span style={k}>Pai</span><span style={v}>{pai || "—"}</span></div>
                    <div style={rowKV}><span style={k}>Mãe</span><span style={v}>{mae || "—"}</span></div>
                    <div style={rowKV}><span style={k}>Últ. IA</span><span style={v}>{ultimaIA || "—"}</span></div>
                    <div style={rowKV}><span style={k}>Últ. Parto</span><span style={v}>{ultimoParto || "—"}</span></div>
                    {prevPartoBR && <div style={rowKV}><span style={k}>Previsão Parto</span><span style={v}>{prevPartoBR}</span></div>}
                    {!!nLactacoes && <div style={rowKV}><span style={k}>Lactações</span><span style={v}>{nLactacoes}</span></div>}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== estilos ===== */
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
const inputBase = { width:'100%', padding:'0.75rem', borderRadius:12, border:'1px solid #d1d5db', fontSize:'1rem', backgroundColor:'#fff' };
const inputReadOnly = { ...inputBase, backgroundColor: '#f8fafc' };
const lbl = { fontWeight: 700, fontSize: 13, color:"#334155", display:"block", marginBottom:6 };

const card = { background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:20, boxShadow:"0 1px 8px rgba(0,0,0,0.04)", marginBottom:14 };
const cardHeader = { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 };
const cardTitle = { fontWeight:900, fontSize:16 };

const botaoPrincipal = { backgroundColor:'#2563eb', color:'#fff', border:'none', padding:'0.75rem 1.25rem', borderRadius:12, fontWeight:'800', fontSize:'1rem', cursor:'pointer' };
const botaoVerde = (filled=false)=>({ backgroundColor: filled ? '#10b981' : '#ecfdf5', color: filled ? '#fff' : '#065f46', padding:'0.75rem 1.25rem', borderRadius:12, fontWeight:'800', border: filled ? 'none' : '1px solid #a7f3d0', cursor:'pointer' });
const botaoGhost = { background:'#f8fafc', color:'#111827', padding:'0.7rem 1rem', borderRadius:12, border:'1px solid #e5e7eb', cursor:'pointer' };

const alertSucesso = { backgroundColor:'#ecfdf5', color:'#065f46', border:'1px solid #34d399', padding:'0.75rem 1rem', borderRadius:12, margin:'8px 0 14px', fontWeight:'700' };
const alertErro = { backgroundColor:'#fef2f2', color:'#991b1b', border:'1px solid #fca5a5', padding:'0.75rem 1rem', borderRadius:12, margin:'8px 0 14px', fontWeight:'700' };

const rowKV = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, fontSize:14 };
const k = { color:"#64748b", fontWeight:700 };
const v = { color:"#111827", fontWeight:900 };
