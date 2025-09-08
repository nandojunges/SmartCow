// src/pages/Animais/FichaAnimal/FichaAnimalLeite.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import api from "../../../api";

/* =========== helpers básicos =========== */
function toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d === "string" && d.includes("/")) {
    const [dd, mm, yyyy] = d.split("/").map(Number);
    return new Date(yyyy, (mm || 1) - 1, dd || 1, 12);
  }
  return new Date(String(d));
}
function diasEntre(a, b) {
  if (!a || !b) return null;
  const d1 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const d2 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((d2 - d1) / 86400000);
}
const toNum = (v) => {
  if (v === "" || v == null) return 0;
  return Number(String(v).replace(",", ".")) || 0;
};

/* Normaliza historico: pode vir TEXT (string JSON) do backend */
function getHist(animal) {
  const h = animal?.historico;
  if (!h) return {};
  if (typeof h === "string") {
    try { return JSON.parse(h); } catch { return {}; }
  }
  return h;
}
/* Array de leite do animal (historico.leite > leite) */
function getLeiteArr(animal) {
  const hist = getHist(animal);
  if (Array.isArray(hist?.leite)) return hist.leite;
  if (Array.isArray(animal?.leite)) return animal.leite;
  return [];
}

/* =========== Curva de Lactação =========== */
function CurvaLactacao({ dadosLactacao = [] }) {
  const data = useMemo(() => {
    // Não filtramos por DEL; se faltar, usamos o índice para manter ordem
    return (dadosLactacao || [])
      .map((d, i) => ({
        DEL: d.DEL ?? i,
        litros: Number(d.litros ?? d.volume ?? d.qtd ?? 0),
        data: d.dataFormatada || d.data,
      }))
      .sort((a, b) => (a.DEL ?? 0) - (b.DEL ?? 0));
  }, [dadosLactacao]);

  if (!data.length) {
    return <p className="italic text-gray-500">Sem coletas de leite para exibir.</p>;
  }

  return (
    <div className="bg-white rounded-xl shadow p-3">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid stroke="#e5e7eb" strokeOpacity={0.6} />
          <XAxis dataKey="DEL" label={{ value: "DEL (dias)", position: "insideBottom", offset: -5 }} />
          <YAxis label={{ value: "Litros/dia", angle: -90, position: "insideLeft" }} />
          <Tooltip
            formatter={(v) => [`${v} L`, "Leite"]}
            labelFormatter={(_, idx) => `DEL: ${data[idx]?.DEL} • ${data[idx]?.data || ""}`}
          />
          <Legend />
          <Line type="monotone" dataKey="litros" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} name="Leite" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* =========== CCS =========== */
function SecaoCCS({ ccs = [] }) {
  const [mostrarTabela, setMostrarTabela] = useState(false);
  if (!ccs || ccs.length === 0) return <p className="italic text-gray-500">Sem registros de CCS.</p>;

  const ordenados = [...ccs].sort((a, b) => toDate(a.data) - toDate(b.data));
  const dadosGrafico = ordenados.map((r) => ({
    data: toDate(r.data)?.toLocaleDateString("pt-BR"),
    valor: Number(r.valor ?? 0),
  }));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-3">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={dadosGrafico}>
            <CartesianGrid stroke="#e5e7eb" strokeOpacity={0.5} />
            <XAxis dataKey="data" />
            <YAxis />
            <Tooltip formatter={(v) => [`${v}`, "CCS (cél/mL)"]} labelFormatter={(label) => `Data: ${label}`} />
            <Line type="monotone" dataKey="valor" stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} name="CCS" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setMostrarTabela((s) => !s)}
          style={{
            background: "#f3f4f6",
            border: "1px solid #d1d5db",
            padding: "0.6rem 1rem",
            borderRadius: "0.5rem",
            cursor: "pointer",
            fontSize: "0.95rem",
            fontWeight: "500",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e7eb")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#f3f4f6")}
        >
          {mostrarTabela ? "Esconder Histórico ↓" : "Mostrar Histórico ↑"}
        </button>
      </div>

      {mostrarTabela && (
        <div
          style={{
            overflow: "hidden",
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            boxShadow: "0 0 4px rgba(0,0,0,0.1)",
            marginTop: "0.75rem",
          }}
        >
          <table className="min-w-full text-sm table-fixed border-collapse">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-4 py-2 border border-[#f1f5f9] text-left">Data</th>
                <th className="px-4 py-2 border border-[#f1f5f9] text-left">CCS (cél/mL)</th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-2 border border-[#f1f5f9] font-medium">
                    {toDate(r.data)?.toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-2 border border-[#f1f5f9]">{r.valor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* =========== CMT =========== */
function SecaoCMT({ cmt = [] }) {
  const [mostrarTabela, setMostrarTabela] = useState(false);
  if (!Array.isArray(cmt) || cmt.length === 0)
    return <p className="italic text-gray-500">Sem registros de CMT.</p>;

  const resNum = (res) =>
    res === "0" ? 0 : res === "+" ? 1 : res === "++" ? 2 : res === "+++" ? 3 : null;

  const dadosGrafico = [...cmt]
    .sort((a, b) => toDate(a.data) - toDate(b.data))
    .map((r) => ({
      data: toDate(r.data)?.toLocaleDateString("pt-BR"),
      PE: resNum(r?.cmt?.PE?.resultado),
      PD: resNum(r?.cmt?.PD?.resultado),
      AE: resNum(r?.cmt?.AE?.resultado ?? r?.cmt?.TE?.resultado),
      AD: resNum(r?.cmt?.AD?.resultado ?? r?.cmt?.TD?.resultado),
    }));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-3">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={dadosGrafico}>
            <CartesianGrid stroke="#e5e7eb" strokeOpacity={0.5} />
            <XAxis dataKey="data" />
            <YAxis
              label={{ value: "Grau", angle: -90, position: "insideLeft" }}
              domain={[0, 3]}
              ticks={[0, 1, 2, 3]}
            />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="PE" stroke="#10b981" name="Posterior Esq." dot />
            <Line type="monotone" dataKey="PD" stroke="#f97316" name="Posterior Dir." dot />
            <Line type="monotone" dataKey="AE" stroke="#3b82f6" name="Anterior Esq." dot />
            <Line type="monotone" dataKey="AD" stroke="#ef4444" name="Anterior Dir." dot />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setMostrarTabela((s) => !s)}
          style={{
            background: "#f3f4f6",
            border: "1px solid #d1d5db",
            padding: "0.6rem 1rem",
            borderRadius: "0.5rem",
            cursor: "pointer",
            fontSize: "0.95rem",
            fontWeight: "500",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e7eb")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#f3f4f6")}
        >
          {mostrarTabela ? "Esconder Histórico ↓" : "Mostrar Histórico ↑"}
        </button>
      </div>

      {mostrarTabela && (
        <div
          style={{
            overflow: "hidden",
            borderRadius: "0.75rem",
            border: "1px solid #f1f5f9",
            boxShadow: "0 0 4px rgba(0,0,0,0.05)",
            marginTop: "0.75rem",
          }}
        >
          <table className="min-w-full text-sm table-fixed border-collapse">
            <thead style={{ backgroundColor: "#f9fafb", color: "#374151" }}>
              <tr>
                <th className="px-4 py-2 border border-[#f1f5f9] text-left">Data</th>
                <th className="px-4 py-2 border border-[#f1f5f9] text-left">PE</th>
                <th className="px-4 py-2 border border-[#f1f5f9] text-left">PD</th>
                <th className="px-4 py-2 border border-[#f1f5f9] text-left">AE</th>
                <th className="px-4 py-2 border border-[#f1f5f9] text-left">AD</th>
              </tr>
            </thead>
            <tbody>
              {[...cmt]
                .sort((a, b) => toDate(a.data) - toDate(b.data))
                .map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-2 border border-[#f1f5f9] font-medium">
                      {toDate(r.data)?.toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-2 border border-[#f1f5f9]">{r?.cmt?.PE?.resultado ?? "—"}</td>
                    <td className="px-4 py-2 border border-[#f1f5f9]">{r?.cmt?.PD?.resultado ?? "—"}</td>
                    <td className="px-4 py-2 border border-[#f1f5f9]">
                      {r?.cmt?.AE?.resultado ?? r?.cmt?.TE?.resultado ?? "—"}
                    </td>
                    <td className="px-4 py-2 border border-[#f1f5f9]">
                      {r?.cmt?.AD?.resultado ?? r?.cmt?.TD?.resultado ?? "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* =========== Card Brix =========== */
function CardBrixColostro({ brix }) {
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const registros = Array.isArray(brix) ? brix : brix ? [brix] : [];
  if (!registros.length) return <p className="italic text-gray-500">Sem registro de Brix.</p>;

  const ordenados = [...registros].sort((a, b) => toDate(b.data) - toDate(a.data));
  const maisRecente = ordenados[0];
  const valor = Number(maisRecente?.valor ?? 0);
  const avaliacao = valor >= 22 ? "Excelente" : valor >= 18 ? "Bom" : "Baixo";

  return (
    <div className="space-y-4">
      <div className="bg-white shadow rounded-xl p-4 text-sm space-y-1">
        <h3 className="text-lg font-semibold">🌟 Brix do Colostro</h3>
        <p><strong>Valor:</strong> {valor}%</p>
        <p><strong>Data:</strong> {toDate(maisRecente.data)?.toLocaleDateString("pt-BR")}</p>
        <p><strong>Avaliação:</strong> {avaliacao}</p>
      </div>

      {ordenados.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={() => setMostrarHistorico((s) => !s)}
            style={{
              background: "#f3f4f6",
              border: "1px solid #d1d5db",
              padding: "0.6rem 1rem",
              borderRadius: "0.5rem",
              cursor: "pointer",
              fontSize: "0.95rem",
              fontWeight: "500",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e7eb")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#f3f4f6")}
          >
            {mostrarHistorico ? "Esconder Histórico ↓" : "Mostrar Histórico ↑"}
          </button>
        </div>
      )}

      {mostrarHistorico && (
        <div
          style={{
            overflow: "hidden",
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            boxShadow: "0 0 4px rgba(0,0,0,0.1)",
            marginTop: "0.75rem",
          }}
        >
          <table className="min-w-full text-sm table-fixed border-collapse">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-4 py-2 border border-[#f1f5f9] text-left">Data</th>
                <th className="px-4 py-2 border border-[#f1f5f9] text-left">Valor (%)</th>
                <th className="px-4 py-2 border border-[#f1f5f9] text-left">Avaliação</th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-2 border border-[#f1f5f9] font-medium">
                    {toDate(r.data)?.toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-2 border border-[#f1f5f9]">{Number(r.valor ?? 0)}%</td>
                  <td className="px-4 py-2 border border-[#f1f5f9]">
                    {Number(r.valor ?? 0) >= 22 ? "Excelente" : Number(r.valor ?? 0) >= 18 ? "Bom" : "Baixo"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* =========== Componente principal =========== */
export default function FichaAnimalLeite({ animal }) {
  const [full, setFull] = useState(animal);
  const [dadosLactacao, setDadosLactacao] = useState([]);
  const [ccs, setCCS] = useState([]);
  const [cmt, setCMT] = useState([]);
  const [brix, setBrix] = useState(null);

  // Fallback: carrega do serviço /milk se não houver no animal
  const carregarLeiteDoServico = async (numeroVaca, partoStr) => {
    try {
      if (!numeroVaca) return [];
      const { data: datas } = await api.get("/milk/dates");
      const listaDatas = Array.isArray(datas) ? datas : [];
      const recentes = listaDatas.sort((a, b) => new Date(a) - new Date(b)).slice(-180);

      const registros = [];
      for (const d of recentes) {
        const { data: reg } = await api.get("/milk/measurements", { params: { date: d } });
        const dadosDia = reg?.dados || {};
        const item = dadosDia?.[String(numeroVaca)];
        if (!item) continue;

        const total = toNum(item.total) || (toNum(item.manha) + toNum(item.tarde) + toNum(item.terceira));
        const dt = toDate(d);
        const dtParto = toDate(partoStr);
        const DEL = dtParto ? diasEntre(dtParto, dt) : null;

        registros.push({
          data: d,
          dataFormatada: dt?.toLocaleDateString("pt-BR"),
          litros: Number(total.toFixed ? total.toFixed(1) : total),
          DEL,
          lactacao: 1,
        });
      }
      return registros;
    } catch {
      return [];
    }
  };

  // carrega o animal completo por id e reage a "animaisAtualizados"
  useEffect(() => {
    let cancel = false;
    const fetchIt = async () => {
      try {
        if (animal?.id) {
          const { data } = await api.get(`/animals/${animal.id}`);
          if (!cancel) setFull(data);
        } else {
          setFull(animal);
        }
      } catch {
        setFull(animal);
      }
    };
    fetchIt();
    const onUpd = () => fetchIt();
    window.addEventListener("animaisAtualizados", onUpd);
    return () => { cancel = true; window.removeEventListener("animaisAtualizados", onUpd); };
  }, [animal?.id]);

  // monta seções (curva, cmt, ccs, brix)
  useEffect(() => {
    (async () => {
      if (!full) return;

      const hist = getHist(full);
      setCMT(Array.isArray(hist?.mastite?.cmt) ? hist.mastite.cmt : Array.isArray(full?.cmt) ? full.cmt : []);
      setCCS(Array.isArray(hist?.ccs) ? hist.ccs : Array.isArray(full?.ccs) ? full.ccs : []);
      setBrix(hist?.brix ?? full?.brix ?? null);

      const partoStr = full.ultimoParto || full.parto || full.dataParto;
      const dtParto = toDate(partoStr);

      const fonte = getLeiteArr(full);
      if (fonte.length) {
        const ordenado = [...fonte].sort((a, b) => toDate(a.data) - toDate(b.data));
        const comDEL = ordenado.map((dado, i) => {
          const litros =
            dado.litros != null
              ? Number(dado.litros)
              : toNum(dado.manha) + toNum(dado.tarde) + toNum(dado.terceira);
          const dataMed = toDate(dado.data);
          const DEL = dtParto ? diasEntre(dtParto, dataMed) : i; // fallback no índice
          return {
            ...dado,
            litros,
            DEL,
            dataFormatada: dataMed?.toLocaleDateString("pt-BR"),
            lactacao: dado.lactacao || 1,
          };
        });
        setDadosLactacao(comDEL);
      } else {
        const fromSvc = await carregarLeiteDoServico(full?.numero, partoStr);
        setDadosLactacao(fromSvc);
      }
    })();
  }, [full]);

  return (
    <div className="p-4 space-y-10">
      <section>
        <h2 className="text-lg font-semibold mb-3">Curva de Lactação</h2>
        <CurvaLactacao dadosLactacao={dadosLactacao} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Teste CMT</h2>
        <SecaoCMT cmt={cmt} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">CCS Individual</h2>
        <SecaoCCS ccs={ccs} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Brix do Colostro</h2>
        <CardBrixColostro brix={brix} />
      </section>
    </div>
  );
}
