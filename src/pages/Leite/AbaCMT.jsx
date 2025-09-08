// src/pages/Leite/AbaCMT.jsx
import React, { useEffect, useState } from "react";
import api, { getAnimais } from "../../api";

export default function AbaRegistroCMT({ vaca }) {
  if (!vaca) {
    return <div style={{ padding: "1rem", color: "red" }}>Vaca não encontrada.</div>;
  }

  const hoje = new Date().toISOString().substring(0, 10);

  const [dados, setDados] = useState({
    data: hoje,
    operador: "",
    novoResponsavel: "",
    cmt: {
      TE: { resultado: "", observacao: "" }, // Anterior Esquerdo
      TD: { resultado: "", observacao: "" }, // Anterior Direito
      PE: { resultado: "", observacao: "" }, // Posterior Esquerdo
      PD: { resultado: "", observacao: "" }, // Posterior Direito
    },
  });

  const [responsaveisSalvos, setResponsaveisSalvos] = useState([]);
  const [mostrarNovoResp, setMostrarNovoResp] = useState(false);

  const [animalId, setAnimalId] = useState(vaca?.id || null);
  const [historico, setHistorico] = useState({}); // objeto completo do historico do animal

  const coresResultado = {
    "0": "#10b981",
    "+": "#facc15",
    "++": "#f97316",
    "+++": "#ef4444",
  };

  /* ---------- helpers localStorage para responsáveis (até existir backend) ---------- */
  const loadResponsaveis = () => {
    try {
      const raw = localStorage.getItem("responsaveisCMT");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };
  const saveResponsaveis = (arr) => {
    try {
      localStorage.setItem("responsaveisCMT", JSON.stringify(arr));
    } catch {}
  };

  /* ---------- resolve animalId e baixa histórico ---------- */
  useEffect(() => {
    (async () => {
      try {
        // resolve id pelo prop ou pelo numero
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
        console.warn("AbaRegistroCMT: falha ao carregar histórico:", e?.response?.data || e?.message);
        setHistorico({});
      }
    })();
  }, [vaca?.id, vaca?.numero]);

  /* ---------- carrega responsáveis locais ---------- */
  useEffect(() => {
    setResponsaveisSalvos(loadResponsaveis());
  }, []);

  /* ---------- ao mudar a data, pré-preenche com registro existente ---------- */
  useEffect(() => {
    const arr = historico?.mastite?.cmt;
    if (!dados.data || !Array.isArray(arr)) return;

    const existente = arr.find((r) => r.data === dados.data);
    if (existente) {
      setDados((prev) => ({
        ...prev,
        operador: existente.operador || "",
        cmt: existente.cmt || prev.cmt,
      }));
    } else {
      setDados((prev) => ({
        ...prev,
        operador: "",
        cmt: {
          TE: { resultado: "", observacao: "" },
          TD: { resultado: "", observacao: "" },
          PE: { resultado: "", observacao: "" },
          PD: { resultado: "", observacao: "" },
        },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.data, historico]);

  const handleChange = (quarto, campo, valor) => {
    setDados((prev) => ({
      ...prev,
      cmt: {
        ...prev.cmt,
        [quarto]: { ...prev.cmt[quarto], [campo]: valor },
      },
    }));
  };

  const salvarNovoResponsavel = () => {
    const nome = (dados.novoResponsavel || "").trim();
    if (!nome) return;
    if (!responsaveisSalvos.includes(nome)) {
      const atualizados = [...responsaveisSalvos, nome];
      setResponsaveisSalvos(atualizados);
      saveResponsaveis(atualizados);
    }
    setDados((d) => ({ ...d, operador: nome, novoResponsavel: "" }));
    setMostrarNovoResp(false);
  };

  const salvar = async () => {
    if (!animalId) {
      alert("Não foi possível identificar o animal.");
      return;
    }
    if (!dados.data) {
      alert("Informe a data do teste.");
      return;
    }

    const arr = Array.isArray(historico?.mastite?.cmt) ? [...historico.mastite.cmt] : [];
    const registro = {
      data: dados.data,
      operador: dados.operador || "",
      cmt: dados.cmt,
    };

    const ix = arr.findIndex((r) => r.data === dados.data);
    if (ix >= 0) arr[ix] = { ...arr[ix], ...registro };
    else arr.push(registro);

    const novoHistorico = {
      ...historico,
      mastite: {
        ...(historico?.mastite || {}),
        cmt: arr,
      },
    };

    try {
      await api.put(`/animals/${animalId}`, { historico: novoHistorico });
      setHistorico(novoHistorico);
      window.dispatchEvent(new Event("animaisAtualizados"));
      alert("💾 Registro de CMT salvo para a vaca " + vaca.numero);
    } catch (e) {
      console.warn("AbaRegistroCMT: falha ao salvar:", e?.response?.data || e?.message);
      alert("Não foi possível salvar agora.");
    }
  };

  const Quarto = ({ sigla, nome }) => (
    <div style={box}>
      <div
        style={{
          width: 24,
          height: 24,
          margin: "0 auto 0.75rem",
          borderRadius: "50%",
          backgroundColor: coresResultado[dados.cmt[sigla].resultado] || "#e2e8f0",
        }}
      />
      <strong style={{ marginBottom: "0.5rem", display: "block" }}>
        {nome} ({sigla})
      </strong>

      <select
        value={dados.cmt[sigla].resultado}
        onChange={(e) => handleChange(sigla, "resultado", e.target.value)}
        style={{ ...input, marginBottom: "0.5rem" }}
      >
        <option value="">Selecione</option>
        <option value="0">Negativo</option>
        <option value="+">+</option>
        <option value="++">++</option>
        <option value="+++">+++</option>
      </select>

      <input
        placeholder="Observações"
        value={dados.cmt[sigla].observacao}
        onChange={(e) => handleChange(sigla, "observacao", e.target.value)}
        style={input}
      />
    </div>
  );

  return (
    <div style={{ padding: "1.5rem", fontFamily: "Poppins, sans-serif" }}>
      <h3 className="text-lg font-bold mb-4">
        📋 Registro CMT — {vaca.numero} {vaca.brinco ? ` / ${vaca.brinco}` : ""}
      </h3>

      <div style={linha}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={label}>Data do Teste</label>
          <input
            type="date"
            value={dados.data}
            onChange={(e) => setDados({ ...dados, data: e.target.value })}
            style={input}
          />
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <label style={label}>Responsável</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              list="responsaveis"
              value={dados.operador}
              onChange={(e) => setDados({ ...dados, operador: e.target.value })}
              style={input}
              placeholder="Digite ou selecione…"
            />
            <button
              onClick={() => setMostrarNovoResp(!mostrarNovoResp)}
              style={btnIcon}
              title="Adicionar novo responsável"
            >
              ＋
            </button>
            <datalist id="responsaveis">
              {responsaveisSalvos.map((r, i) => (
                <option key={i} value={r} />
              ))}
            </datalist>
          </div>

          {mostrarNovoResp && (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <input
                value={dados.novoResponsavel}
                onChange={(e) => setDados({ ...dados, novoResponsavel: e.target.value })}
                style={input}
                placeholder="Novo nome"
              />
              <button onClick={salvarNovoResponsavel} style={btnPrimary}>
                Salvar
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={grid4}>
        <Quarto sigla="PE" nome="Posterior Esquerdo" />
        <Quarto sigla="PD" nome="Posterior Direito" />
        <Quarto sigla="TE" nome="Anterior Esquerdo" />
        <Quarto sigla="TD" nome="Anterior Direito" />
      </div>

      <div style={{ textAlign: "right", marginTop: "1rem" }}>
        <button onClick={salvar} style={btnPrimary}>
          💾 Salvar
        </button>
      </div>
    </div>
  );
}

/* ---------------- estilos locais ---------------- */
const input = {
  width: "100%",
  padding: "0.5rem",
  borderRadius: "0.5rem",
  border: "1px solid #ccc",
  boxSizing: "border-box",
  display: "block",
  fontSize: "0.9rem",
};
const label = { display: "block", fontSize: "0.9rem", marginBottom: "0.25rem", fontWeight: 500 };
const grid4 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: "1.5rem",
  marginTop: "1.5rem",
};
const box = {
  border: "1px solid #ddd",
  borderRadius: "1rem",
  padding: "1.2rem",
  textAlign: "center",
  boxShadow: "0 4px 10px rgba(0,0,0,0.06)",
  backgroundColor: "#f9f9f9",
};
const linha = {
  display: "flex",
  gap: "1.5rem",
  marginTop: "1rem",
  flexWrap: "wrap",
};
const btnPrimary = {
  background: "#2563eb",
  color: "#fff",
  border: "none",
  padding: "0.6rem 1.2rem",
  borderRadius: "0.5rem",
  cursor: "pointer",
  fontWeight: 600,
};
const btnIcon = {
  background: "#2563eb",
  color: "#fff",
  border: "none",
  width: 36,
  height: 36,
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
