// src/pages/Leite/AbaCCS.jsx
import React, { useEffect, useMemo, useState } from "react";
import api, { getAnimais } from "../../api"; // ✅ caminho correto (2 níveis acima)
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  Bar,
  CartesianGrid,
  Cell,
} from "recharts";

export default function AbaCCS({ vaca }) {
  const [data, setData] = useState("");
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [historico, setHistorico] = useState([]);
  const [historicoObj, setHistoricoObj] = useState({});
  const [tipoGrafico, setTipoGrafico] = useState("linha");

  const toNumber = (s) =>
    typeof s === "string"
      ? parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0
      : Number(s || 0);

  const safeId = vaca?.id;

  // Carrega histórico.ccs do animal
  useEffect(() => {
    (async () => {
      try {
        let id = safeId;

        // fallback se a vaca veio sem id
        if (!id) {
          const lista = await getAnimais();
          const arr = (Array.isArray(lista?.items) ? lista.items : lista) || [];
          const found = arr.find((a) => String(a.numero) === String(vaca?.numero));
          id = found?.id;
        }
        if (!id) return;

        const { data: animal } = await api.get(`/animals/${id}`);
        const histObj =
          animal?.historico && typeof animal.historico === "object"
            ? animal.historico
            : {};
        const ccsArr = Array.isArray(histObj.ccs) ? histObj.ccs : [];
        setHistoricoObj(histObj);
        setHistorico(ccsArr);
      } catch (e) {
        console.warn(
          "AbaCCS: falha ao carregar histórico do animal:",
          e?.response?.data || e?.message
        );
        setHistoricoObj({});
        setHistorico([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeId, vaca?.numero]);

  // Preenche valor/observação ao escolher uma data já existente
  useEffect(() => {
    const reg = historico.find((h) => h.data === data);
    if (reg) {
      setValor(Number(reg.valor || 0).toLocaleString("pt-BR"));
      setObservacao(reg.observacao || "");
    } else {
      setValor("");
      setObservacao("");
    }
  }, [data, historico]);

  const historicoOrdenado = useMemo(
    () => [...historico].sort((a, b) => new Date(a.data) - new Date(b.data)),
    [historico]
  );

  const handleSalvar = async () => {
    if (!data || !valor) {
      alert("Preencha a data e o valor da análise.");
      return;
    }
    const registro = {
      id: Date.now(),
      tipo: "CCS",
      data,
      valor: toNumber(valor),
      observacao: observacao || "",
      vaca: vaca?.numero,
    };

    // merge por data (substitui se já existir)
    const proxHistorico = (() => {
      const ix = historico.findIndex((h) => h.data === data);
      if (ix >= 0) {
        const clone = [...historico];
        clone[ix] = { ...clone[ix], ...registro };
        return clone;
      }
      return [...historico, registro];
    })();

    try {
      if (!safeId) {
        const lista = await getAnimais();
        const arr = (Array.isArray(lista?.items) ? lista.items : lista) || [];
        const found = arr.find((a) => String(a.numero) === String(vaca?.numero));
        if (!found?.id) throw new Error("Animal sem ID resolvido.");
        const payload = { historico: { ...historicoObj, ccs: proxHistorico } };
        await api.put(`/animals/${found.id}`, payload);
      } else {
        const payload = { historico: { ...historicoObj, ccs: proxHistorico } };
        await api.put(`/animals/${safeId}`, payload);
      }

      setHistoricoObj((h) => ({ ...h, ccs: proxHistorico }));
      setHistorico(proxHistorico);
      alert("✅ Análise registrada com sucesso!");
    } catch (e) {
      console.warn(
        "AbaCCS: falha ao salvar CCS no animal:",
        e?.response?.data || e?.message
      );
      alert("Não foi possível salvar agora.");
    }
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const p = payload[0]?.payload || {};
      return (
        <div style={{ padding: "0.5rem", background: "#fff", border: "1px solid #ddd" }}>
          <p>
            <strong>Data:</strong> {p.data}
          </p>
          <p>
            <strong>CCS:</strong>{" "}
            {Number(p.valor || 0).toLocaleString("pt-BR")} células/mL
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ padding: "1.5rem", fontFamily: "Poppins, sans-serif" }}>
      <h3 style={{ fontWeight: 600, fontSize: "1.2rem", marginBottom: "1rem" }}>
        📉 Registro de Análises
      </h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "1.5rem",
        }}
      >
        <div>
          <label style={{ fontWeight: 500 }}>Tipo de análise:</label>
          <input
            value="CCS"
            disabled
            style={{ width: "100%", padding: "0.5rem", borderRadius: 8, border: "1px solid #ccc" }}
          />
        </div>

        <div>
          <label style={{ fontWeight: 500 }}>Data:</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            style={{ width: "100%", padding: "0.5rem", borderRadius: 8, border: "1px solid #ccc" }}
          />
        </div>

        <div>
          <label style={{ fontWeight: 500 }}>Valor (células/mL):</label>
          <input
            type="text"
            value={valor}
            onChange={(e) => {
              const num = e.target.value.replace(/\D/g, "");
              setValor(num ? Number(num).toLocaleString("pt-BR") : "");
            }}
            style={{ width: "100%", padding: "0.5rem", borderRadius: 8, border: "1px solid #ccc" }}
          />
        </div>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label style={{ fontWeight: 500 }}>Observações:</label>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          style={{
            width: "100%",
            padding: "0.5rem",
            borderRadius: 8,
            border: "1px solid #ccc",
            height: 100,
          }}
          placeholder="Observações gerais..."
        />
      </div>

      <button
        onClick={handleSalvar}
        style={{
          marginTop: "1rem",
          padding: "0.5rem 1rem",
          backgroundColor: "#2563eb",
          color: "#fff",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
        }}
      >
        💾 Salvar Análise
      </button>

      {historicoOrdenado.length > 0 && (
        <>
          <h4 style={{ marginTop: "2rem", fontWeight: 600 }}>📊 Evolução das Análises</h4>

          <select
            value={tipoGrafico}
            onChange={(e) => setTipoGrafico(e.target.value)}
            style={{ marginBottom: "1rem", padding: "0.3rem", borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="linha">Linha</option>
            <option value="coluna">Coluna</option>
          </select>

          <ResponsiveContainer width="100%" height={250}>
            {tipoGrafico === "linha" ? (
              <LineChart data={historicoOrdenado}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="data" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Line dataKey="valor" dot={{ strokeWidth: 2 }} />
              </LineChart>
            ) : (
              <BarChart data={historicoOrdenado}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="data" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="valor">
                  {historicoOrdenado.map((entry) => (
                    <Cell
                      key={entry.id}
                      fill={Number(entry.valor) > 500000 ? "#ff4d4f" : "#22c55e"}
                    />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>

          <h4 style={{ marginTop: "2rem", fontWeight: 600 }}>📝 Histórico Completo</h4>
          <ul>
            {[...historicoOrdenado].reverse().map((h) => (
              <li key={h.id}>
                {h.data} — {Number(h.valor || 0).toLocaleString("pt-BR")} células/mL{" "}
                {h.observacao && `(${h.observacao})`}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
