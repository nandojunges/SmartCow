// src/pages/Leite/AbaTratamentoMastite.jsx
import React, { useEffect, useState } from "react";
import api, { getAnimais } from "../../api";

export default function AbaTratamentoMastite({ vaca }) {
  if (!vaca) {
    return <div style={{ padding: "1rem", color: "red" }}>Vaca não encontrada.</div>;
  }

  const hoje = new Date().toISOString().slice(0, 10);

  const [animalId, setAnimalId] = useState(vaca?.id || null);
  const [historico, setHistorico] = useState({});

  const [dataInicio, setDataInicio] = useState(hoje);
  const [antibiotico, setAntibiotico] = useState("");
  const [via, setVia] = useState("");
  const [duracao, setDuracao] = useState("");
  const [aine, setAine] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // resolve o ID do animal e carrega histórico completo
  useEffect(() => {
    (async () => {
      try {
        let id = vaca?.id || null;
        if (!id) {
          const lista = await getAnimais(); // /api/v1/animals
          const arr = (Array.isArray(lista?.items) ? lista.items : lista) || [];
          id = arr.find((a) => String(a.numero) === String(vaca.numero))?.id || null;
        }
        if (!id) return;
        setAnimalId(id);

        const { data: animal } = await api.get(`/animals/${id}`);
        const hist = (animal?.historico && typeof animal.historico === "object") ? animal.historico : {};
        setHistorico(hist);
      } catch (e) {
        console.warn("AbaTratamentoMastite: falha ao carregar histórico:", e?.response?.data || e?.message);
        setHistorico({});
      }
    })();
  }, [vaca?.id, vaca?.numero]);

  // pré-preenche a partir do último diagnóstico com sugestão
  useEffect(() => {
    const diag = historico?.mastite?.diagnosticos;
    if (!Array.isArray(diag) || diag.length === 0) return;

    const ultimoComSugestao = [...diag].reverse().find((d) => d?.sugestao);
    if (!ultimoComSugestao?.sugestao) return;

    const s = ultimoComSugestao.sugestao;
    setAntibiotico((prev) => prev || s.antibiotico || "");
    setVia((prev) => prev || s.via || "");
    setDuracao((prev) => prev || s.duracao || "");
    setAine((prev) => prev || s.aine || "");
  }, [historico]);

  const handleSalvar = async () => {
    if (!animalId) {
      alert("Não foi possível identificar o animal.");
      return;
    }
    if (!dataInicio || !antibiotico || !via || !duracao) {
      alert("Preencha data, antibiótico, via e duração.");
      return;
    }

    const novo = {
      dataInicio,
      antibiotico,
      via,
      duracao,
      aine,
      observacoes,
    };

    const arr = Array.isArray(historico?.mastite?.tratamento) ? [...historico.mastite.tratamento] : [];
    arr.push(novo);

    const novoHistorico = {
      ...historico,
      mastite: {
        ...(historico?.mastite || {}),
        tratamento: arr,
      },
    };

    try {
      await api.put(`/animals/${animalId}`, { historico: novoHistorico });
      setHistorico(novoHistorico);
      alert("💾 Tratamento registrado com sucesso!");
    } catch (e) {
      console.warn("AbaTratamentoMastite: falha ao salvar:", e?.response?.data || e?.message);
      alert("Não foi possível salvar agora.");
    }
  };

  const input = {
    width: "100%",
    padding: "0.5rem",
    borderRadius: "0.5rem",
    border: "1px solid #ccc",
    boxSizing: "border-box",
    fontSize: "0.9rem",
    background: "white",
  };

  const label = {
    display: "block",
    fontWeight: 500,
    fontSize: "0.9rem",
    marginBottom: "0.3rem",
  };

  return (
    <div style={{ padding: "1.5rem", fontFamily: "Poppins, sans-serif" }}>
      <h3 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "1.2rem" }}>
        💊 Registro de Tratamento de Mastite — {vaca.numero}
      </h3>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={label}>Data de início:</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={input} />
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <label style={label}>Antibiótico:</label>
          <input type="text" value={antibiotico} onChange={(e) => setAntibiotico(e.target.value)} style={input} />
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={label}>Via de administração:</label>
          <select value={via} onChange={(e) => setVia(e.target.value)} style={input}>
            <option value="">Selecione</option>
            <option value="IMM">Intra-mamária (IMM)</option>
            <option value="Sistêmico">Sistêmico</option>
            <option value="Sistêmico + IMM">Sistêmico + IMM</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={label}>Duração (dias):</label>
          <input type="text" value={duracao} onChange={(e) => setDuracao(e.target.value)} style={input} />
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <label style={label}>AINE utilizado:</label>
          <input type="text" value={aine} onChange={(e) => setAine(e.target.value)} style={input} />
        </div>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label style={label}>Observações:</label>
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          style={{ ...input, minHeight: "80px" }}
          placeholder="Observações gerais, tetos afetados, resposta clínica etc."
        />
      </div>

      <div style={{ textAlign: "right", marginTop: "1rem" }}>
        <button onClick={handleSalvar} style={btnPrimary}>
          💾 Salvar Tratamento
        </button>
      </div>
    </div>
  );
}

/* estilos locais */
const btnPrimary = {
  background: "#16a34a",
  color: "#fff",
  border: "none",
  padding: "0.6rem 1.2rem",
  borderRadius: "0.5rem",
  cursor: "pointer",
  fontWeight: 600,
};
