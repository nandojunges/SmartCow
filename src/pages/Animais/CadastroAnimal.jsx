// src/pages/Animais/CadastroAnimal.jsx
import React, { useEffect, useRef, useState } from "react";
import Select from "react-select";
import { criarAnimal as apiCriarAnimal } from "../../api";

/* ===========================================
   Helpers
=========================================== */
function formatarDataDigitada(valor) {
  const s = valor.replace(/\D/g, "").slice(0, 8);
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

/* ==========================================================
   Modal Complementar (mesmo do seu arquivo original)
========================================================== */
function FichaComplementarAnimal({ numeroAnimal, onFechar, onSalvar }) {
  const [nomeTouro, setNomeTouro] = useState("");
  const [nomeMae, setNomeMae] = useState("");
  const [ultimaIA, setUltimaIA] = useState("");
  const [ultimoParto, setUltimoParto] = useState("");
  const [nLactacoes, setNLactacoes] = useState("");
  const [historico, setHistorico] = useState([]);
  const [modalTipo, setModalTipo] = useState(null);
  const [dataModal, setDataModal] = useState("");
  const [mensagemSucesso, setMensagemSucesso] = useState("");

  const refs = useRef([]);

  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  const handleKey = (e, index) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    }
  };

  const salvarCompleta = async () => {
    const dataInvalida = (txt) => {
      if (!txt) return false;
      if (txt.length !== 10) return true;
      const [d, m, a] = txt.split("/").map(Number);
      const data = new Date(a, m - 1, d);
      return data.getDate() !== d || data.getMonth() !== m - 1 || data.getFullYear() !== a;
    };

    if (dataInvalida(ultimaIA) || dataInvalida(ultimoParto) || historico.some((h) => dataInvalida(h.data))) {
      alert("⚠️ Preencha as datas corretamente no formato dd/mm/aaaa.");
      return;
    }

    let dataPrevistaParto = "";
    if (ultimaIA?.length === 10) {
      const [dia, mes, ano] = ultimaIA.split("/");
      const dataIA = new Date(ano, mes - 1, dia);
      dataIA.setDate(dataIA.getDate() + 280);
      dataPrevistaParto = dataIA.toLocaleDateString("pt-BR");
    }

    const dados = {
      pai: nomeTouro || "",
      pai_id: "",
      mae: nomeMae || "",
      ultimaIA,
      ultimoParto,
      dataPrevistaParto,
      nLactacoes: parseInt(nLactacoes || 0, 10),
      historico: {
        inseminacoes: historico
          .filter((h) => h.tipo === "IA")
          .map((h) => ({ data: h.data, touro: nomeTouro || "—", inseminador: "—", tipo: "IA" })),
        partos: historico.filter((h) => h.tipo === "Parto").map((h) => ({ data: h.data, tipo: "Parto", obs: "—" })),
        secagens: historico.filter((h) => h.tipo === "Secagem").map((h) => ({ data: h.data, tipo: "Secagem", obs: "—" })),
      },
    };

    onSalvar?.(dados);
    setMensagemSucesso("✅ Ficha complementar salva com sucesso!");
    setTimeout(() => { setMensagemSucesso(""); onFechar?.(); }, 1200);
  };

  const adicionarEvento = () => {
    if (!dataModal || !modalTipo) return;
    const [d, m, a] = dataModal.split("/").map(Number);
    const data = new Date(a, m - 1, d);
    if (data.getDate() !== d || data.getMonth() !== m - 1 || data.getFullYear() !== a) return;
    const novo = { tipo: modalTipo, data: dataModal };
    const atualizado = [...historico, novo].sort((A, B) => {
      const [da, ma, ya] = A.data.split("/").map(Number);
      const [db, mb, yb] = B.data.split("/").map(Number);
      return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
    });
    setHistorico(atualizado);
    setDataModal("");
    setModalTipo(null);
  };

  return (
    <div style={{ padding: '2rem' }}>
      {mensagemSucesso && <div style={alertSucesso}>✅ {mensagemSucesso}</div>}
      <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>📋 Ficha Complementar</h2>

      <div style={grid2}>
        <div>
          <label>Touro (nome)</label>
          <input
            ref={(el) => (refs.current[0] = el)}
            type="text"
            value={nomeTouro}
            onChange={(e) => setNomeTouro(e.target.value)}
            onKeyDown={(e) => handleKey(e, 0)}
            placeholder="Digite o nome do touro"
            style={inputBase}
          />
        </div>
        <div>
          <label>Nome da Mãe</label>
          <input
            ref={(el) => (refs.current[1] = el)}
            type="text"
            value={nomeMae}
            onChange={(e) => setNomeMae(e.target.value)}
            onKeyDown={(e) => handleKey(e, 1)}
            style={inputBase}
          />
        </div>
      </div>

      <div style={{ ...grid2, marginTop: '1.5rem' }}>
        <div>
          <label>Último Parto</label>
          <input
            ref={(el) => (refs.current[2] = el)}
            type="text"
            placeholder="dd/mm/aaaa"
            value={ultimoParto}
            onChange={(e) => setUltimoParto(formatarDataDigitada(e.target.value))}
            onKeyDown={(e) => handleKey(e, 2)}
            style={inputBase}
          />
        </div>
        <div>
          <label>Última IA</label>
          <input
            ref={(el) => (refs.current[3] = el)}
            type="text"
            placeholder="dd/mm/aaaa"
            value={ultimaIA}
            onChange={(e) => setUltimaIA(formatarDataDigitada(e.target.value))}
            onKeyDown={(e) => handleKey(e, 3)}
            style={inputBase}
          />
        </div>
        <div>
          <label>Número de lactações</label>
          <input
            ref={(el) => (refs.current[4] = el)}
            type="number"
            min="0"
            value={nLactacoes}
            onChange={(e) => setNLactacoes(e.target.value)}
            onKeyDown={(e) => handleKey(e, 4)}
            style={inputBase}
          />
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h4 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Histórico Reprodutivo</h4>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <button onClick={() => setModalTipo("IA")} style={botaoAcao}>➕ Adicionar IA anterior</button>
          <button onClick={() => setModalTipo("Parto")} style={botaoAcao}>➕ Adicionar Parto anterior</button>
          <button onClick={() => setModalTipo("Secagem")} style={botaoAcao}>➕ Adicionar Secagem anterior</button>
        </div>

        {modalTipo && (
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <input
              ref={(el) => (refs.current[5] = el)}
              type="text"
              value={dataModal}
              placeholder="dd/mm/aaaa"
              onChange={(e) => setDataModal(formatarDataDigitada(e.target.value))}
              onKeyDown={(e) => handleKey(e, 5)}
              style={inputBase}
            />
            <button ref={(el) => (refs.current[6] = el)} onClick={adicionarEvento} style={botaoPrincipal}>Salvar {modalTipo}</button>
          </div>
        )}

        <ul style={{ paddingLeft: '1rem', color: '#374151' }}>
          {historico.map((h, i) => (<li key={i}>📌 {h.tipo} em {h.data}</li>))}
        </ul>
      </div>

      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
        <button onClick={salvarCompleta} style={botaoPrincipal}>💾 Salvar Tudo</button>
        <button onClick={onFechar} style={botaoCancelar}>✖ Cancelar Ficha Complementar</button>
      </div>
    </div>
  );
}

/* =========================================
   Formulário principal
========================================= */
export default function CadastroAnimal({ animais = [], onAtualizar }) {
  const [numero, setNumero] = useState("");
  const [brinco, setBrinco] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [sexo, setSexo] = useState("");
  const [origem, setOrigem] = useState("propriedade");
  const [valorCompra, setValorCompra] = useState("");
  const [raca, setRaca] = useState("");
  const [novaRaca, setNovaRaca] = useState("");
  const [racasAdicionais, setRacasAdicionais] = useState([]);
  const [mostrarCampoNovaRaca, setMostrarCampoNovaRaca] = useState(false);
  const [mostrarComplementar, setMostrarComplementar] = useState(false);
  const [categoria, setCategoria] = useState("");
  const [idade, setIdade] = useState("");
  const [mesesIdade, setMesesIdade] = useState(0); // 👈 novo
  const [sitProd, setSitProd] = useState("");       // 👈 novo
  const [sitReprod, setSitReprod] = useState("");   // 👈 novo
  const [mensagemSucesso, setMensagemSucesso] = useState("");
  const [mensagemErro, setMensagemErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const brincoRef = useRef();
  const nascimentoRef = useRef();
  const salvarRef = useRef();
  const refs = [brincoRef, nascimentoRef, salvarRef];

  // gera número automaticamente
  useEffect(() => {
    const maiorNumero = animais.reduce((max, a) => Math.max(max, parseInt(a?.numero || 0, 10)), 0);
    setNumero(String(maiorNumero + 1));
  }, [animais]);

  useEffect(() => { brincoRef.current?.focus(); }, []);

  useEffect(() => {
    const esc = (e) => e.key === "Escape" && setMostrarComplementar(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  // Atualiza idade/categoria/regras
  useEffect(() => {
    const { idade: id, categoria: cat, meses } = calcularIdadeECategoria(nascimento, sexo);
    setIdade(id); setCategoria(cat); setMesesIdade(meses);

    // regra: < 12 meses (e fêmea) => reprodutiva obrigatoriamente "vazia"
    if (sexo === "femea" && meses < 12) {
      setSitReprod("vazia");
    }
    // default da produtiva baseado em idade/sexo
    if (sexo === "femea") {
      if (meses < 24 && (sitProd === "" || sitProd === "lactante")) {
        // novilha ou bezerra não pode ser lactante
        setSitProd("nao_lactante");
      }
    } else if (sexo === "macho") {
      setSitProd("nao_lactante");
      setSitReprod(""); // não aplicável
    }
  }, [nascimento, sexo]); // eslint-disable-line

  const adicionarNovaRaca = () => {
    const v = (novaRaca || "").trim();
    if (!v) return;
    if (racasAdicionais.includes(v)) { setRaca(v); setNovaRaca(""); setMostrarCampoNovaRaca(false); return; }
    const atualizadas = [...racasAdicionais, v];
    setRacasAdicionais(atualizadas);
    setRaca(v);
    setNovaRaca("");
    setMostrarCampoNovaRaca(false);
  };

  const salvarAnimal = async (complementares = {}) => {
    if (!brinco || !nascimento || !raca || !sexo) {
      alert("⚠️ Preencha Brinco, Nascimento, Sexo e Raça.");
      return;
    }
    // aplica coerções finais
    let estadoCompat = "vazia";
    if (sitProd === "lactante") estadoCompat = "lactante";
    else if (sitProd === "seca") estadoCompat = "seca";
    else estadoCompat = "vazia";

    // reforço: se fêmea com < 12 meses, força vazia
    const reprodFinal = (sexo === "femea" && mesesIdade < 12) ? "vazia" : (sitReprod || "vazia");

    try {
      setSalvando(true);
      const payload = {
        numero,
        brinco,
        nascimento,
        raca,
        estado: estadoCompat, // compat com telas antigas
        sexo,
        categoria,
        situacao_produtiva: sitProd || undefined,
        situacao_reprodutiva: reprodFinal || undefined,
        pai: complementares?.pai || "",
        pai_id: "",
        mae: complementares?.mae || "",
        n_lactacoes: Number(complementares?.nLactacoes || 0),
        ultima_ia: complementares?.ultimaIA || "",
        parto: complementares?.ultimoParto || "",
        previsao_parto: complementares?.dataPrevistaParto || "",
        historico: complementares?.historico || null,
      };
      const inserido = await apiCriarAnimal(payload);
      onAtualizar?.([...(animais || []), inserido]);
      setMensagemSucesso("✅ Animal cadastrado com sucesso!");
      setMensagemErro("");
      setBrinco(""); setNascimento(""); setSexo(""); setOrigem("propriedade");
      setValorCompra(""); setRaca(""); setNovaRaca(""); setIdade(""); setCategoria("");
      setSitProd(""); setSitReprod("");
      setMostrarCampoNovaRaca(false); setMostrarComplementar(false);
      setNumero(String(parseInt(numero || "0", 10) + 1));
      setTimeout(() => setMensagemSucesso(""), 2500);
    } catch (err) {
      console.error("Erro ao salvar animal:", err);
      setMensagemErro("❌ Erro no cadastro. Tente novamente.");
      setTimeout(() => setMensagemErro(""), 3000);
    } finally {
      setSalvando(false);
    }
  };

  const handleEnter = (e, index) => {
    if (e.key === "Enter") {
      const next = refs[index + 1];
      if (next?.current) next.current.focus();
    }
  };

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

  // opções dinâmicas de situação produtiva
  const prodOptions = (() => {
    if (sexo === "femea" && mesesIdade >= 24) {
      return [
        { value: "lactante", label: "Lactante" },
        { value: "seca", label: "Seca" },
      ];
    }
    return [{ value: "nao_lactante", label: "Não lactante" }];
  })();

  // opções de situação reprodutiva
  const reprodOptions = [
    { value: "vazia", label: "Vazia" },
    { value: "inseminada", label: "Inseminada" },
    { value: "prenhe", label: "Prenhe" },
    { value: "pev", label: "PEV (pós-parto)" },
    { value: "descartada", label: "Descarte" },
  ];

  const reprodBloqueada = sexo === "femea" && mesesIdade < 12;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', fontFamily: 'Poppins, sans-serif', padding: '0 1rem 1rem', marginTop: '-1rem' }}>
      <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '1rem', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
        {mensagemSucesso && <div style={alertSucesso}>✅ {mensagemSucesso}</div>}
        {mensagemErro && <div style={alertErro}>❌ {mensagemErro}</div>}

        <div style={grid2}>
          <div>
            <label style={{ fontWeight: '600' }}>Número</label>
            <input type="text" value={numero} readOnly style={inputReadOnly} />
          </div>
          <div>
            <label style={{ fontWeight: '600' }}>Brinco</label>
            <input
              type="text" value={brinco} ref={brincoRef}
              onChange={(e) => setBrinco(e.target.value)}
              onKeyDown={(e) => handleEnter(e, 0)}
              style={inputBase} placeholder="Digite o brinco"
            />
          </div>
        </div>

        <div style={{ ...grid2, marginTop: '2rem' }}>
          <div>
            <label style={{ fontWeight: '600' }}>Nascimento</label>
            <input
              type="text" value={nascimento} ref={nascimentoRef}
              onChange={(e) => setNascimento(formatarDataDigitada(e.target.value))}
              onKeyDown={(e) => handleEnter(e, 1)}
              placeholder="dd/mm/aaaa" style={inputBase}
            />
          </div>
          <div>
            <label style={{ fontWeight: '600' }}>Sexo</label>
            <Select options={sexoOptions} value={sexoOptions.find((opt) => opt.value === sexo) || null}
              onChange={(e) => setSexo(e.value)} placeholder="Selecione" />
          </div>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <label style={{ fontWeight: '600' }}>Origem</label>
          <Select options={origemOptions} value={origemOptions.find((opt) => opt.value === origem) || null}
            onChange={(e) => setOrigem(e.value)} placeholder="Selecione" />
          {origem === "comprado" && (
            <div style={{ marginTop: '1rem' }}>
              <label>Valor da compra (R$)</label>
              <input type="text" value={valorCompra} onChange={(e) => setValorCompra(maskMoedaBR(e.target.value))}
                style={{ ...inputBase, width: '60%' }} />
            </div>
          )}
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', gap: '2rem', backgroundColor: '#f1f5f9', padding: '1rem', borderRadius: '0.5rem' }}>
          <div><strong>Categoria:</strong> {categoria || "—"}</div>
          <div><strong>Idade estimada:</strong> {idade || "—"}</div>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <label style={{ fontWeight: '600' }}>Raça</label>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Select options={racaOptions} value={racaOptions.find((opt) => opt.value === raca) || null}
              onChange={(e) => setRaca(e.value)} placeholder="Selecione" styles={{ container: (base) => ({ ...base, flex: 1 }) }} />
            <button onClick={() => setMostrarCampoNovaRaca(!mostrarCampoNovaRaca)} title="Adicionar nova raça" style={botaoVerde()}>
              ＋
            </button>
          </div>
          {mostrarCampoNovaRaca && (
            <div style={{ marginTop: '0.8rem', display: 'flex', gap: '1rem' }}>
              <input type="text" value={novaRaca} onChange={(e) => setNovaRaca(e.target.value)}
                placeholder="Digite nova raça" style={{ ...inputBase, flex: 1 }} />
              <button onClick={adicionarNovaRaca} style={botaoVerde(true)}>Adicionar</button>
            </div>
          )}
        </div>

        {/* ===== Situações iniciais ===== */}
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Situações iniciais</h3>

          <div style={grid2}>
            <div>
              <label style={{ fontWeight: '600' }}>Situação produtiva</label>
              <Select
                options={prodOptions}
                value={prodOptions.find(o => o.value === sitProd) || null}
                onChange={(o) => setSitProd(o?.value || "")}
                placeholder="Selecione"
              />
              {sexo === "femea" && mesesIdade < 24 && (
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                  Animais com menos de 24 meses ficam como <strong>Não lactante</strong>.
                </div>
              )}
            </div>

            <div>
              <label style={{ fontWeight: '600' }}>Situação reprodutiva</label>
              <Select
                isDisabled={reprodBloqueada || sexo !== "femea"}
                options={reprodOptions}
                value={reprodOptions.find(o => o.value === (reprodBloqueada ? "vazia" : sitReprod)) || (reprodBloqueada ? reprodOptions[0] : null)}
                onChange={(o) => setSitReprod(o?.value || "")}
                placeholder={sexo === "macho" ? "Não aplicável para machos" : "Selecione"}
              />
              {reprodBloqueada && (
                <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>
                  <strong>Regra:</strong> fêmeas com menos de 12 meses são obrigatoriamente <strong>vazias</strong>.
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'space-between' }}>
          {!mostrarComplementar && (
            <button onClick={() => salvarAnimal()} disabled={salvando} ref={salvarRef} style={botaoPrincipal}>
              💾 Cadastrar Animal
            </button>
          )}
          <button onClick={() => setMostrarComplementar(true)} style={botaoSecundario}>
            ➕ Completar Ficha
          </button>
        </div>
      </div>

      {mostrarComplementar && (
        <div role="dialog" aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex",
                   alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={(e) => { if (e.target === e.currentTarget) setMostrarComplementar(false); }}>
          <div style={{ background: "#fff", width: "min(900px, 92vw)", borderRadius: 16 }}>
            <FichaComplementarAnimal
              numeroAnimal={numero}
              onSalvar={(dados) => salvarAnimal(dados)}
              onFechar={() => setMostrarComplementar(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== estilos ===== */
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' };
const inputBase = { width:'100%', padding:'0.75rem', borderRadius:'0.5rem', border:'1px solid #ccc', fontSize:'1rem', backgroundColor:'#fff' };
const inputReadOnly = { ...inputBase, backgroundColor: '#f1f5f9' };
const botaoPrincipal = { backgroundColor:'#2563eb', color:'#fff', border:'none', padding:'0.75rem 2rem', borderRadius:'0.5rem', fontWeight:'600', fontSize:'1rem', cursor:'pointer' };
const botaoSecundario = { backgroundColor:'#e0e7ff', color:'#1e3a8a', padding:'0.6rem 1.2rem', borderRadius:'0.5rem', border:'1px solid #c7d2fe', fontWeight:'500', cursor:'pointer' };
const botaoVerde = (c=false)=>({ backgroundColor:'#10b981', color:'#fff', padding: c?'0.6rem 1.2rem':'0 1rem', borderRadius:'0.5rem', fontWeight:'bold', cursor:'pointer', border:'none' });
const botaoAcao = { backgroundColor:'#f3f4f6', color:'#111827', padding:'0.6rem 1rem', borderRadius:'0.5rem', border:'1px solid #cbd5e1', fontSize:'0.95rem', fontWeight:'500', cursor:'pointer' };
const botaoCancelar = { backgroundColor:'#fef2f2', color:'#991b1b', padding:'0.75rem 2rem', borderRadius:'0.5rem', border:'1px solid #fecaca', fontSize:'1rem', fontWeight:'600', cursor:'pointer' };
const alertSucesso = { backgroundColor:'#ecfdf5', color:'#065f46', border:'1px solid #34d399', padding:'0.75rem 1rem', borderRadius:'0.5rem', marginBottom:'1.5rem', fontWeight:'500', display:'flex', alignItems:'center', gap:'0.5rem' };
const alertErro = { backgroundColor:'#fef2f2', color:'#991b1b', border:'1px solid #fca5a5', padding:'0.75rem 1rem', borderRadius:'0.5rem', marginBottom:'1.5rem', fontWeight:'500', display:'flex', alignItems:'center', gap:'0.5rem' };
