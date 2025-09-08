// src/pages/Leite/AbaDiagnosticoMastite.jsx
import React, { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import GuiaMastite from "./GuiaMastite";
import api, { getAnimais } from "../../api";

const agentesMastite = [
  "Staphylococcus aureus","Streptococcus agalactiae","Escherichia coli",
  "Klebsiella spp.","Candida spp.","Prototheca spp.","Streptococcus uberis",
  "Streptococcus dysgalactiae","Corynebacterium bovis","Pseudomonas aeruginosa",
  "Mycoplasma spp.","Serratia spp.","Nocardia spp.","Aspergillus spp."
];

const baseAntibioticos = [
  { nome: "Amoxicilina",  classe: "Penicilina",            via: "IMM" },
  { nome: "Cloxacilina",  classe: "Penicilina resistente", via: "IMM" },
  { nome: "Cefquinoma",   classe: "Cefalosporina 4ªG",     via: "IMM" },
  { nome: "Ceftiofur",    classe: "Cefalosporina 3ªG",     via: "Sistêmico" },
  { nome: "Enrofloxacina",classe: "Fluoroquinolona",       via: "Sistêmico" },
  { nome: "Tylosina",     classe: "Macrolídeo",            via: "Sistêmico" },
  { nome: "Florfenicol",  classe: "Fenicol",               via: "Sistêmico" },
  { nome: "Gentamicina",  classe: "Aminoglicosídeo",       via: "IMM" }
];

/* ------ Botão de ação com “look” dos seus botões (sem CSS externo) ------ */
function ActionBtn({ onClick, title, children }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 10,
        border: `1px solid ${hover ? "#1e3a8a" : "rgba(30,58,138,.25)"}`,
        background: hover ? "rgba(30,58,138,.06)" : "#f8fafc",
        color: "#1e3a8a",
        fontWeight: 600,
        cursor: "pointer",
        transition: "0.15s ease"
      }}
    >
      {children}
    </button>
  );
}

export default function AbaDiagnosticoMastite({ vaca }) {
  const [data, setData] = useState("");
  const [agentes, setAgentes] = useState([]);
  const [sensibilidade, setSensibilidade] = useState({});
  const [sugestao, setSugestao] = useState(null);
  const [mostrarGuia, setMostrarGuia] = useState(false);

  const [animalId, setAnimalId] = useState(vaca?.id || null);
  const [hist, setHist] = useState({});

  // lê de diagnosticos (plural) com fallback para diagnostico (singular)
  const diagArr = useMemo(() => {
    const plural = hist?.mastite?.diagnosticos;
    const singular = hist?.mastite?.diagnostico;
    return Array.isArray(plural) ? plural : Array.isArray(singular) ? singular : [];
  }, [hist]);

  // Atalho de teclado “G” para abrir/fechar o guia
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === "g" || e.key === "G") && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setMostrarGuia((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Resolve ID e carrega histórico
  useEffect(() => {
    (async () => {
      try {
        let id = vaca?.id || null;
        if (!id) {
          const lista = await getAnimais();
          const arr = (Array.isArray(lista?.items) ? lista.items : lista) || [];
          id = arr.find((a) => String(a.numero) === String(vaca?.numero))?.id || null;
        }
        if (!id) return;

        setAnimalId(id);
        const { data: animal } = await api.get(`/animals/${id}`);
        const historico = (animal?.historico && typeof animal.historico === "object") ? animal.historico : {};
        setHist(historico);
      } catch (e) {
        console.warn("AbaDiagnosticoMastite: erro carregando histórico:", e?.response?.data || e?.message);
        setHist({});
      }
    })();
  }, [vaca?.id, vaca?.numero]);

  // Preenche ao escolher data existente
  useEffect(() => {
    if (!data) return;
    const existente = diagArr.find((r) => r.data === data);
    if (existente) {
      setAgentes(Array.isArray(existente.agentes) ? existente.agentes : []);
      setSensibilidade(existente.sensibilidade || {});
      setSugestao(existente.sugestao || null);
    } else {
      setAgentes([]);
      setSensibilidade({});
      setSugestao(null);
    }
  }, [data, diagArr]);

  const toggleResultado = (nome) => {
    setSensibilidade((prev) => ({
      ...prev,
      [nome]:
        prev[nome] === "Sensível"   ? "Resistente" :
        prev[nome] === "Resistente" ? ""           : "Sensível",
    }));
  };

  const gerarSugestao = () => {
    const isFungoOuAlga = (a) => /candida|prototheca|aspergillus/i.test(a || "");
    if ((agentes || []).some(isFungoOuAlga)) {
      setSugestao({ erro: "⚠️ Tratamento antibiótico é ineficaz para agentes fúngicos/algais." });
      return;
    }
    const sensiveis = baseAntibioticos.filter((ab) => sensibilidade[ab.nome] === "Sensível");
    if (sensiveis.length === 0) {
      setSugestao({ erro: "Nenhum antibiótico sensível encontrado." });
      return;
    }
    const escolhido =
      sensiveis.length === 1
        ? sensiveis[0]
        : { nome: `${sensiveis[0].nome} + ${sensiveis[1].nome}`, classe: "Associação", via: "Sistêmico + IMM" };

    setSugestao({
      antibiotico: escolhido.nome,
      classe: escolhido.classe,
      via: escolhido.via,
      duracao: "5-7 dias",
      aine: "Meloxicam ou Flunixin",
    });
  };

  const salvarDiagnostico = async () => {
    if (!data || (agentes || []).length === 0) {
      alert("Preencha a data e ao menos um agente.");
      return;
    }
    if (!animalId) {
      alert("Não foi possível identificar o animal.");
      return;
    }

    const registro = {
      id: Date.now(),
      tipo: "diagnostico",
      data,
      agentes: [...agentes],
      sensibilidade: { ...sensibilidade },
      sugestao: sugestao || null,
      vaca: vaca?.numero,
    };

    // upsert por data
    const atual = [...diagArr];
    const ix = atual.findIndex((r) => r.data === data);
    if (ix >= 0) atual[ix] = { ...atual[ix], ...registro, id: atual[ix].id || registro.id };
    else atual.push(registro);

    // sempre salva em 'diagnosticos' (plural)
    const novoHistorico = {
      ...hist,
      mastite: {
        ...(hist.mastite || {}),
        diagnosticos: atual,
      },
    };

    try {
      await api.put(`/animals/${animalId}`, { historico: novoHistorico });
      setHist(novoHistorico);
      alert("✅ Diagnóstico salvo com sucesso!");
    } catch (e) {
      console.warn("AbaDiagnosticoMastite: erro ao salvar:", e?.response?.data || e?.message);
      alert("Não foi possível salvar agora.");
    }
  };

  const input = { width: "100%", padding: "0.5rem", borderRadius: "0.5rem", border: "1px solid #ccc", boxSizing: "border-box", fontSize: "0.9rem", background: "white" };
  const label = { display: "block", fontWeight: 500, fontSize: "0.9rem", marginBottom: "0.3rem" };

  return (
    <div style={{ padding: "1.5rem", fontFamily: "Poppins, sans-serif" }}>
      {/* Toolbar do topo: Título + botão “Guia Clínico” (G) */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "1rem",
        gap: 8
      }}>
        <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>
          🔬 Diagnóstico de Mastite
        </h3>

        <ActionBtn
          title="Abrir Guia Clínico (atalho: G)"
          onClick={() => setMostrarGuia(true)}
        >
          <span>📖</span>
          <span>Guia Clínico (G)</span>
        </ActionBtn>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={label}>Data:</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={input} />
        </div>

        <div style={{ flex: 2, minWidth: 280 }}>
          <label style={label}>Agente(s) Identificado(s):</label>
          <Select
            isMulti
            value={(agentes || []).map((a) => ({ label: a, value: a }))}
            options={agentesMastite.map((a) => ({ label: a, value: a }))}
            onChange={(selected) => setAgentes((selected || []).map((s) => s.value))}
            placeholder="Selecione um ou mais agentes..."
            styles={{
              control: (base) => ({ ...base, borderRadius: "0.5rem", borderColor: "#ccc", padding: 2 }),
              menu: (base) => ({ ...base, zIndex: 9999 }),
            }}
          />
        </div>
      </div>

      <label style={{ ...label, marginTop: "1.2rem" }}>Teste de Sensibilidade:</label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "0.8rem",
          marginBottom: "1.2rem",
        }}
      >
        {baseAntibioticos.map((ab) => {
          const estado = sensibilidade[ab.nome] || "";
          const bg = estado === "Sensível" ? "#dcfce7" : estado === "Resistente" ? "#fee2e2" : "#f1f5f9";
          const bc = estado === "Sensível" ? "#16a34a" : estado === "Resistente" ? "#ef4444" : "#cbd5e1";
          return (
            <button
              key={ab.nome}
              onClick={() => toggleResultado(ab.nome)}
              style={{
                padding: "0.7rem",
                borderRadius: "0.6rem",
                fontSize: "0.9rem",
                textAlign: "left",
                border: `1px solid ${bc}`,
                background: bg,
                transition: "0.2s ease",
                cursor: "pointer",
              }}
              title={`${ab.nome} — ${ab.classe} (${ab.via})`}
            >
              {ab.nome} — {estado || "Sem resultado"}
            </button>
          );
        })}
      </div>

      <div style={{ textAlign: "left", marginTop: "1rem", marginBottom: "1rem" }}>
        <button
          onClick={gerarSugestao}
          style={{
            backgroundColor: "#2563eb", color: "white", padding: "0.9rem 2rem",
            borderRadius: "999px", fontSize: "1rem", fontWeight: 600,
            border: "none", cursor: "pointer", boxShadow: "0 2px 5px rgba(0,0,0,0.2)"
          }}
        >
          💡 Gerar Sugestão Inteligente
        </button>
      </div>

      {sugestao && (
        <div style={{ marginTop: "1.5rem", background: "#f9fafb", padding: "1rem", borderRadius: "0.75rem", border: "1px solid #e5e7eb" }}>
          {sugestao.erro ? (
            <p style={{ color: "#dc2626", fontWeight: 600 }}>{sugestao.erro}</p>
          ) : (
            <>
              <p><strong>Antibiótico:</strong> {sugestao.antibiotico}</p>
              <p><strong>Classe:</strong> {sugestao.classe}</p>
              <p><strong>Via:</strong> {sugestao.via}</p>
              <p><strong>Duração:</strong> {sugestao.duracao}</p>
              <p><strong>AINE Recomendado:</strong> {sugestao.aine}</p>

              <button
                onClick={salvarDiagnostico}
                style={{ marginTop: "1rem", backgroundColor: "#16a34a", color: "white", padding: "0.7rem 1.5rem", borderRadius: "0.6rem", fontSize: "0.95rem", border: "none", cursor: "pointer" }}
              >
                💾 Salvar Diagnóstico
              </button>
            </>
          )}
        </div>
      )}

      {mostrarGuia && <GuiaMastite onFechar={() => setMostrarGuia(false)} />}
    </div>
  );
}
