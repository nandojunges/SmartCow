// -----------------------------------------------------------------------------
// Reprodução — Cadastro de Touros (estoque de doses) e Inseminadores
// Conectado ao backend com 2 routers: /genetica e /reproducao
// Agora com colunas corretas: doses_adquiridas e doses_restantes (com fallback)
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import api from "../../api";

/* ===== helpers ===== */
const onlyInt = (v) => {
  const n = parseInt(String(v ?? "").replace(/\D/g, "") || "0", 10);
  return Number.isFinite(n) ? n : 0;
};
const fmtIntStr = (v) => String(onlyInt(v));
const fmtMoneyStr = (v) => {
  const s = String(v ?? "");
  const only = s.replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number(only);
  return Number.isFinite(n) ? String(n) : "";
};
const moneyToNumber = (s) => {
  const only = String(s ?? "").replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number(only);
  return Number.isFinite(n) ? n : 0;
};

/* ===== API (conectado a 2 routers) ===== */
// TOUROS  -> backend/resources/genetica.resource.js
async function fetchTouros() {
  const { data } = await api.get("/api/v1/genetica/touros", { params: { limit: 999 } });
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return items.map((t) => {
    // compatibilidade: se não vier doses_*, usa quantidade/qtd/qtd_doses...
    const adquiridas =
      t.doses_adquiridas ??
      t.doses_total ??
      t.quantidade ??
      t.qtd ??
      t.qtd_doses ??
      0;
    const restantes =
      t.doses_restantes ??
      t.quantidade ??
      t.qtd ??
      t.qtd_doses ??
      0;
    return {
      id: t.id || t.uuid,
      nome: t.nome || "",
      codigo: t.codigo || t.code || "",
      ativo: t.ativo ?? true,
      valor_por_dose: t.valor_por_dose ?? t.preco_dose ?? t.valor_dose ?? 0,
      volume_dose: t.volume_dose ?? t.dose_ml ?? t.dose_volume ?? 0.25,
      marca: t.marca || t.empresa || t.fabricante || "",
      // novas colunas normalizadas + legado
      doses_adquiridas: Number(adquiridas) || 0,
      doses_restantes: Number(restantes) || 0,
      // campo legado só para fallback eventual
      quantidade_legado:
        t.quantidade ?? t.qtd ?? t.qtd_doses ?? undefined,
    };
  });
}

async function createTouro(payload) {
  // envio os campos novos; incluo "quantidade" como fallback (será ignorado se o schema novo já existir)
  const body = {
    nome: String(payload?.nome || "").trim(),
    codigo: String(payload?.codigo || "").trim() || null,
    ativo: !!payload?.ativo,
    volume_dose: Number(payload?.volume_dose) || 0.25,
    marca: String(payload?.marca || "").trim() || null,
    valor_por_dose: Number(payload?.valor_por_dose) || 0,
    // estoque — já vem com fallback tratado no salvarTouro
    doses_adquiridas: onlyInt(payload?.doses_adquiridas),
    doses_restantes: onlyInt(payload?.doses_restantes),
    // fallback legado:
    quantidade: onlyInt(payload?.doses_restantes),
  };
  const { data } = await api.post("/api/v1/genetica/touros", body);
  return data;
}

async function updateTouro(id, payload) {
  // manda só o que veio preenchido; se doses_restantes vier "", NÃO manda
  const restBlank = payload?.doses_restantes === "" || payload?.doses_restantes == null;
  const body = {
    ...(payload?.nome != null ? { nome: String(payload.nome).trim() } : {}),
    ...(payload?.codigo != null ? { codigo: String(payload.codigo).trim() || null } : {}),
    ...(payload?.ativo != null ? { ativo: !!payload.ativo } : {}),
    ...(payload?.volume_dose != null ? { volume_dose: Number(payload.volume_dose) || 0.25 } : {}),
    ...(payload?.marca != null ? { marca: String(payload.marca).trim() || null } : {}),
    ...(payload?.valor_por_dose != null ? { valor_por_dose: Number(payload.valor_por_dose) || 0 } : {}),
    ...(payload?.doses_adquiridas != null ? { doses_adquiridas: onlyInt(payload.doses_adquiridas) } : {}),
    ...(!restBlank ? { doses_restantes: onlyInt(payload.doses_restantes) } : {}),
    // fallback legado caso backend ainda use "quantidade"
    ...(!restBlank ? { quantidade: onlyInt(payload.doses_restantes) } : {}),
  };
  const { data } = await api.put(`/api/v1/genetica/touros/${id}`, body);
  return data;
}

async function deleteTouro(id) {
  await api.delete(`/api/v1/genetica/touros/${id}`);
  return true;
}

// entrada de doses correta (compra): soma adquiridas + restantes no backend
async function comprarDoses(touroId, qtd) {
  const { data } = await api.post(`/api/v1/genetica/touros/${touroId}/compra`, { qtd: onlyInt(qtd) });
  return data; // backend pode retornar doses_* ou qtd
}

// INSEMINADORES -> backend/resources/reproducao.resource.js
async function fetchInsems() {
  const { data } = await api.get("/api/v1/reproducao/inseminadores", { params: { limit: 999 } });
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return items.map((i) => ({
    id: i.id || i.uuid,
    nome: i.nome || "",
    registro: i.registro || i.matricula || "",
    ativo: i.ativo ?? true,
  }));
}
async function createInsem(payload) {
  const body = {
    nome: String(payload?.nome || "").trim(),
    registro: String(payload?.registro || "").trim() || null,
    ativo: !!payload?.ativo,
  };
  const { data } = await api.post("/api/v1/reproducao/inseminadores", body);
  return data;
}
async function updateInsem(id, payload) {
  const body = {
    ...(payload?.nome != null ? { nome: String(payload.nome).trim() } : {}),
    ...(payload?.registro != null ? { registro: String(payload.registro).trim() || null } : {}),
    ...(payload?.ativo != null ? { ativo: !!payload.ativo } : {}),
  };
  const { data } = await api.put(`/api/v1/reproducao/inseminadores/${id}`, body);
  return data;
}
async function deleteInsem(id) {
  await api.delete(`/api/v1/reproducao/inseminadores/${id}`);
  return true;
}

/* ===== estilos ===== */
const table = "w-full border-separate [border-spacing:0_4px] text-[14px] text-[#333] table-auto";
const thBase =
  "bg-[#e6f0ff] px-3 py-3 text-left font-bold text-[16px] text-[#1e3a8a] border-b-2 border-[#a8c3e6] sticky z-10 whitespace-nowrap";
const tdBase = "px-4 py-2 bg-white border-b border-[#eee] whitespace-nowrap";
const rowBase = "bg-white shadow-xs transition-colors hover:bg-[#eaf5ff]";
const rowAlt = "even:bg-[#f7f7f8]";

/* ===== select volume ===== */
const VOLUME_OPTIONS = [
  { value: 0.25, label: "0,25 mL" },
  { value: 0.5, label: "0,5 mL" },
];
const selectStyles = {
  container: (b) => ({ ...b, marginTop: 6 }),
  control: (b) => ({ ...b, minHeight: 36, borderColor: "#d1d5db" }),
  menuPortal: (b) => ({ ...b, zIndex: 99999 }),
};

export default function Cadastro() {
  const [tab, setTab] = useState("TOURO");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [touros, setTouros] = useState([]);
  const [insems, setInsems] = useState([]);

  // forms
  const [tForm, setTForm] = useState({
    id: null,
    nome: "",
    codigo: "",
    ativo: true,
    volume_dose: 0.25,
    marca: "",
    valor_por_dose: "",
    doses_adquiridas: "0",
    // deixar vazio para ser opcional; se vazio, assume adquiridas
    doses_restantes: "",
  });
  const [iForm, setIForm] = useState({ id: null, nome: "", registro: "", ativo: true });
  const [entrada, setEntrada] = useState({ open: false, id: null, nome: "", qtd: "" });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const [tPromise, iPromise] = [fetchTouros(), fetchInsems()];
        const [t, i] = await Promise.allSettled([tPromise, iPromise]);

        if (!alive) return;

        if (t.status === "fulfilled") setTouros(t.value);
        else console.error("Falha touros:", t.reason);

        if (i.status === "fulfilled") setInsems(i.value);
        else console.error("Falha inseminadores:", i.reason);

        if (t.status === "rejected" || i.status === "rejected") {
          const msgT = t.status === "rejected" ? "Touros" : null;
          const msgI = i.status === "rejected" ? "Inseminadores" : null;
          setErr(
            `Falha ao carregar ${[msgT, msgI].filter(Boolean).join(" e ")}. ` +
              `Verifique /api/v1/genetica/touros e /api/v1/reproducao/inseminadores.`
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const salvarTouro = async () => {
    try {
      const adq = onlyInt(tForm.doses_adquiridas);
      const rest =
        tForm.doses_restantes === "" || tForm.doses_restantes == null
          ? adq
          : onlyInt(tForm.doses_restantes);

      const payload = {
        nome: tForm.nome.trim(),
        codigo: (tForm.codigo || "").trim(),
        ativo: !!tForm.ativo,
        volume_dose: Number(tForm.volume_dose) || 0.25,
        marca: (tForm.marca || "").trim(),
        valor_por_dose: moneyToNumber(tForm.valor_por_dose),
        doses_adquiridas: adq,
        doses_restantes: rest, // <- fallback aplicado aqui
      };
      if (!payload.nome) return alert("Informe o nome do touro.");

      if (tForm.id) {
        const saved = await updateTouro(tForm.id, payload);
        const id = saved?.id || tForm.id;
        setTouros((list) =>
          list.map((x) =>
            x.id === id
              ? {
                  ...x,
                  ...payload,
                  id,
                }
              : x
          )
        );
      } else {
        const created = await createTouro(payload);
        const id = created?.id || created?.uuid;
        setTouros((list) => [
          {
            ...payload,
            id,
          },
          ...list,
        ]);
      }
      setTForm({
        id: null,
        nome: "",
        codigo: "",
        ativo: true,
        volume_dose: 0.25,
        marca: "",
        valor_por_dose: "",
        doses_adquiridas: "0",
        doses_restantes: "", // volta a ficar opcional
      });
    } catch (e) {
      console.error(e);
      const status = e?.response?.status;
      if (status === 401) {
        alert("Não autorizado. Faça login novamente.");
      } else {
        alert("Não foi possível salvar o touro.");
      }
    }
  };

  const editarTouro = (t) =>
    setTForm({
      id: t.id,
      nome: t.nome || "",
      codigo: t.codigo || "",
      ativo: !!t.ativo,
      volume_dose: Number(t.volume_dose) || 0.25,
      marca: t.marca || "",
      valor_por_dose: String(t.valor_por_dose ?? ""),
      doses_restantes: "",
    });

  const removerTouro = async (t) => {
    if (!confirm(`Remover touro ${t.nome}?`)) return;
    try {
      await deleteTouro(t.id);
      setTouros((list) => list.filter((x) => x.id !== t.id));
    } catch (e) {
      console.error(e);
      alert("Não foi possível excluir o touro.");
    }
  };

  const abrirEntrada = (t) => setEntrada({ open: true, id: t.id, nome: t.nome, qtd: "" });

  const confirmarEntrada = async () => {
    try {
      const qtd = onlyInt(entrada.qtd);
      if (!qtd) return alert("Quantidade inválida.");
      const res = await comprarDoses(entrada.id, qtd);
      // backend pode retornar modelo novo ou legado:
      setTouros((list) =>
        list.map((x) => {
          if (x.id !== entrada.id) return x;
          // tenta ler do retorno:
          const novoAdq = res?.doses_adquiridas;
          const novoRes = res?.doses_restantes;
          if (Number.isFinite(novoAdq) || Number.isFinite(novoRes)) {
            return {
              ...x,
              doses_adquiridas: Number(novoAdq ?? x.doses_adquiridas) || 0,
              doses_restantes: Number(novoRes ?? x.doses_restantes) || 0,
            };
          }
          // fallback: apenas incrementa localmente
          return {
            ...x,
            doses_adquiridas: (x.doses_adquiridas || 0) + qtd,
            doses_restantes: (x.doses_restantes || 0) + qtd,
          };
        })
      );
      setEntrada({ open: false, id: null, nome: "", qtd: "" });
    } catch (e) {
      console.error(e);
      const status = e?.response?.status;
      if (status === 400) {
        alert(e?.response?.data?.detail || "Requisição inválida.");
      } else {
        alert("Não foi possível registrar a entrada de doses.");
      }
    }
  };

  const salvarInsem = async () => {
    try {
      const payload = {
        nome: iForm.nome.trim(),
        registro: (iForm.registro || "").trim(),
        ativo: !!iForm.ativo,
      };
      if (!payload.nome) return alert("Informe o nome do inseminador.");

      if (iForm.id) {
        const saved = await updateInsem(iForm.id, payload);
        const id = saved?.id || iForm.id;
        setInsems((list) => list.map((x) => (x.id === id ? { ...x, ...payload, id } : x)));
      } else {
        const created = await createInsem(payload);
        const id = created?.id || created?.uuid;
        setInsems((list) => [{ ...payload, id }, ...list]);
      }
      setIForm({ id: null, nome: "", registro: "", ativo: true });
    } catch (e) {
      console.error(e);
      const status = e?.response?.status;
      if (status === 401) {
        alert("Não autorizado. Faça login novamente.");
      } else {
        alert("Não foi possível salvar o inseminador.");
      }
    }
  };

  const editarInsem = (i) => setIForm({ ...i });

  const removerInsem = async (i) => {
    if (!confirm(`Remover inseminador ${i.nome}?`)) return;
    try {
      await deleteInsem(i.id);
      setInsems((list) => list.filter((x) => x.id !== i.id));
    } catch (e) {
      console.error(e);
      alert("Não foi possível excluir o inseminador.");
    }
  };

  const totalRestantes = useMemo(
    () =>
      touros.reduce(
        (s, t) =>
          s +
          (Number.isFinite(t.doses_restantes)
            ? Number(t.doses_restantes) || 0
            : Number(t.quantidade_legado) || 0),
        0
      ),
    [touros]
  );

  /* ===== componentes visuais ===== */
  const BtnChip = ({ children, className = "", ...p }) => (
    <button
      type="button"
      className={
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#1e3a8a]/20 hover:border-[#1e3a8a] text-[#1e3a8a] hover:bg-[#1e3a8a]/5 " +
        className
      }
      {...p}
    >
      {children}
    </button>
  );
  const BtnDanger = ({ children, ...p }) => (
    <button
      type="button"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-rose-300 text-rose-700 hover:border-rose-500 hover:bg-rose-50"
      {...p}
    >
      {children}
    </button>
  );
  const Switch = ({ checked, onChange }) => (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="w-10 h-5 inline-flex items-center bg-gray-300 rounded-full p-0.5">
        <span className={`h-4 w-4 rounded-full bg-white transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </span>
      <span className="text-xs text-gray-600">{checked ? "Ativo" : "Inativo"}</span>
    </label>
  );

  return (
    <section className="w-full py-6 font-sans">
      <div className="px-3 md:px-5">
        <div className="flex items-center gap-2 mb-4">
          <button
            className="botao-acao"
            style={{ background: tab === "TOURO" ? "#1F3FB6" : "#eef2ff", color: tab === "TOURO" ? "#fff" : "#1F3FB6" }}
            onClick={() => setTab("TOURO")}
          >
            Touros
          </button>
          <button
            className="botao-acao"
            style={{ background: tab === "INSEM" ? "#1F3FB6" : "#eef2ff", color: tab === "INSEM" ? "#fff" : "#1F3FB6" }}
            onClick={() => setTab("INSEM")}
          >
            Inseminadores
          </button>
          <div className="ml-auto text-sm text-gray-600">
            Saldo total de doses (restantes): <b>{totalRestantes}</b>
          </div>
        </div>

        {err && <div className="mb-3 px-3 py-2 rounded border border-rose-300 bg-rose-50 text-rose-900">{err}</div>}
        {loading && <div className="text-gray-600 mb-3">Carregando…</div>}

        {tab === "TOURO" && (
          <>
            {/* Form */}
            <div className="grid grid-cols-9 gap-3 mb-4">
              <div className="col-span-2">
                <label>Nome</label>
                <input className="w-full border rounded px-2 py-2" value={tForm.nome} onChange={(e) => setTForm((s) => ({ ...s, nome: e.target.value }))} />
              </div>
              <div>
                <label>Código</label>
                <input className="w-full border rounded px-2 py-2" value={tForm.codigo} onChange={(e) => setTForm((s) => ({ ...s, codigo: e.target.value }))} />
              </div>
              <div>
                <label>Volume da dose</label>
                <Select
                  options={VOLUME_OPTIONS}
                  value={VOLUME_OPTIONS.find((o) => o.value === Number(tForm.volume_dose))}
                  onChange={(opt) => setTForm((s) => ({ ...s, volume_dose: opt?.value ?? 0.25 }))}
                  classNamePrefix="rs"
                  styles={selectStyles}
                  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  placeholder="Selecione…"
                />
              </div>
              <div>
                <label>Marca/Empresa</label>
                <input className="w-full border rounded px-2 py-2" value={tForm.marca} onChange={(e) => setTForm((s) => ({ ...s, marca: e.target.value }))} />
              </div>
              <div className="flex items-end">
                <Switch checked={!!tForm.ativo} onChange={(v) => setTForm((s) => ({ ...s, ativo: v }))} />
              </div>

              <div>
                <label>Valor por dose (R$)</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  inputMode="decimal"
                  value={tForm.valor_por_dose}
                  onChange={(e) => setTForm((s) => ({ ...s, valor_por_dose: fmtMoneyStr(e.target.value) }))}
                />
              </div>
              <div>
                <label>Doses adquiridas</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  inputMode="numeric"
                  value={tForm.doses_adquiridas}
                  onChange={(e) => setTForm((s) => ({ ...s, doses_adquiridas: fmtIntStr(e.target.value) }))}
                />
              </div>
              <div>
                <label>Doses restantes</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  inputMode="numeric"
                  placeholder="(em branco = mesmas das adquiridas)"
                  value={tForm.doses_restantes}
                  onChange={(e) => setTForm((s) => ({ ...s, doses_restantes: e.target.value.replace(/\D/g, "") }))}
                />
              </div>

              <div className="col-span-2 flex items-end gap-2 justify-end">
                <BtnChip onClick={salvarTouro}>{tForm.id ? "Salvar alterações" : "Adicionar touro"}</BtnChip>
                {tForm.id && (
                  <BtnChip
                    className="border-gray-300 text-gray-700 hover:border-gray-500"
                    onClick={() =>
                      setTForm({
                        id: null,
                        nome: "",
                        codigo: "",
                        ativo: true,
                        volume_dose: 0.25,
                        marca: "",
                        valor_por_dose: "",
                        doses_adquiridas: "0",
                        doses_restantes: "",
                      })
                    }
                  >
                    Cancelar
                  </BtnChip>
                )}
              </div>
            </div>

            {/* Tabela */}
            <table className={table}>
              <thead>
                <tr>
                  {["Nome", "Código", "Volume", "Marca", "Valor/dose (R$)", "Adquiridas", "Restantes", "Status", "Ações"].map((h) => (
                    <th key={h} className={thBase}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {touros.map((t) => {
                  const adquiridas = Number.isFinite(t.doses_adquiridas) ? t.doses_adquiridas : t.quantidade_legado || 0;
                  const restantes = Number.isFinite(t.doses_restantes) ? t.doses_restantes : t.quantidade_legado || 0;
                  return (
                    <tr key={t.id} className={`${rowBase} ${rowAlt}`}>
                      <td className={tdBase}>{t.nome}</td>
                      <td className={tdBase}>{t.codigo || "—"}</td>
                      <td className={tdBase}>
                        {Number(t.volume_dose || 0.25).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mL
                      </td>
                      <td className={tdBase}>{t.marca || "—"}</td>
                      <td className={tdBase}>
                        {Number(t.valor_por_dose || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                      <td className={tdBase}>
                        <b>{adquiridas}</b>
                      </td>
                      <td className={tdBase}>
                        <b>{restantes}</b>
                      </td>
                      <td className={tdBase}>
                        <span className={`px-2 py-1 rounded text-xs font-bold ${t.ativo ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                          {t.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className={tdBase}>
                        <div className="flex flex-wrap gap-2">
                          <BtnChip onClick={() => editarTouro(t)}>Editar</BtnChip>
                          <BtnChip onClick={() => abrirEntrada(t)}>Entrada de doses</BtnChip>
                          <BtnDanger onClick={() => removerTouro(t)}>Excluir</BtnDanger>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {touros.length === 0 && !loading && (
                  <tr>
                    <td className={tdBase} colSpan={9}>
                      <div className="text-center text-gray-600 py-6">Nenhum touro cadastrado.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {tab === "INSEM" && (
          <>
            <div className="grid grid-cols-5 gap-3 mb-4">
              <div className="col-span-2">
                <label>Nome</label>
                <input className="w-full border rounded px-2 py-2" value={iForm.nome} onChange={(e) => setIForm((s) => ({ ...s, nome: e.target.value }))} />
              </div>
              <div>
                <label>Registro</label>
                <input className="w-full border rounded px-2 py-2" value={iForm.registro} onChange={(e) => setIForm((s) => ({ ...s, registro: e.target.value }))} />
              </div>
              <div className="flex items-end">
                <Switch checked={!!iForm.ativo} onChange={(v) => setIForm((s) => ({ ...s, ativo: v }))} />
              </div>
              <div className="flex items-end justify-end gap-2">
                <BtnChip onClick={salvarInsem}>{iForm.id ? "Salvar alterações" : "Adicionar inseminador"}</BtnChip>
                {iForm.id && (
                  <BtnChip className="border-gray-300 text-gray-700 hover:border-gray-500" onClick={() => setIForm({ id: null, nome: "", registro: "", ativo: true })}>
                    Cancelar
                  </BtnChip>
                )}
              </div>
            </div>

            <table className={table}>
              <thead>
                <tr>
                  {["Nome", "Registro", "Status", "Ações"].map((h) => (
                    <th key={h} className={thBase}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {insems.map((i) => (
                  <tr key={i.id} className={`${rowBase} ${rowAlt}`}>
                    <td className={tdBase}>{i.nome}</td>
                    <td className={tdBase}>{i.registro || "—"}</td>
                    <td className={tdBase}>
                      <span className={`px-2 py-1 rounded text-xs font-bold ${i.ativo ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {i.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className={tdBase}>
                      <div className="flex flex-wrap gap-2">
                        <BtnChip onClick={() => editarInsem(i)}>Editar</BtnChip>
                        <BtnDanger onClick={() => removerInsem(i)}>Excluir</BtnDanger>
                      </div>
                    </td>
                  </tr>
                ))}
                {insems.length === 0 && !loading && (
                  <tr>
                    <td className={tdBase} colSpan={4}>
                      <div className="text-center text-gray-600 py-6">Nenhum inseminador cadastrado.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Modal entrada de doses */}
      {entrada.open && (
        <div
          onMouseDown={(e) => e.target === e.currentTarget && setEntrada({ open: false, id: null, nome: "", qtd: "" })}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
        >
          <div style={{ background: "#fff", borderRadius: 12, padding: 16, width: "min(420px,95vw)" }}>
            <div className="font-bold mb-2">Entrada de doses • {entrada.nome}</div>
            <div className="mb-3">
              <label>Quantidade</label>
              <input
                className="w-full border rounded px-2 py-2"
                value={entrada.qtd}
                onChange={(e) => setEntrada((s) => ({ ...s, qtd: fmtIntStr(e.target.value) }))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <BtnChip className="border-gray-300 text-gray-700 hover:border-gray-500" onClick={() => setEntrada({ open: false, id: null, nome: "", qtd: "" })}>
                Cancelar
              </BtnChip>
              <BtnChip onClick={confirmarEntrada}>Confirmar</BtnChip>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
