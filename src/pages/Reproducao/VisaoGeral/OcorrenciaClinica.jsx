// src/pages/Reproducao/VisaoGeral/OcorrenciaClinica.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";

/* ===== utils ===== */
const todayBR = () => new Date().toLocaleDateString("pt-BR");
const pad = (n) => String(n).padStart(2, "0");
const toISODate = (dt) =>
  `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const parseBR = (str) => {
  if (!str) return null;
  const [d, m, y] = str.split("/").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return Number.isFinite(dt.getTime()) ? dt : null;
};
const addHours = (dt, h) => {
  const d = new Date(dt.getTime());
  d.setHours(d.getHours() + h);
  return d;
};
const duracaoTotalTexto = (reps, gapH) => {
  const r = Number(reps), gap = Number(gapH);
  if (!Number.isFinite(r) || !Number.isFinite(gap) || r <= 0 || gap <= 0) return "";
  const totalH = r * gap; // janela completa
  const d = Math.floor(totalH / 24), hh = totalH % 24;
  if (d && hh) return `${d}d ${hh}h`;
  if (d) return `${d}d`;
  return `${hh}h`;
};

/* ===== presets ===== */
const OCORRENCIAS = [
  "Metrite","Endometrite","Retenção de placenta","Mastite clínica","Mastite subclínica",
  "Cetose","Hipocalcemia (paresia pós-parto)","Deslocamento de abomaso","Acidose/Indigestão",
  "Pneumonia","Diarreia","Pododermatite/Lamíte","Anestro","Cisto folicular","Outro",
];
const VIAS = ["IM","IV","SC","PO","Intramamário","Intrauterino"];
const UNIDADES = ["mL","g","UI","mg/kg","mL/quarter"];

/* ===== normalização de produtos ===== */
const ascii = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const pickFirst = (...vals) => vals.find(v => v !== undefined && v !== null && `${v}`.trim() !== "");

const normalizeProduto = (p) => {
  const id = pickFirst(
    p.id, p.produto_id, p.produtoId,
    p.sku, p.codigo, p.uuid, p._id, null
  );
  const nome = pickFirst(
    p.nome, p.nome_comercial, p.nomeComercial, p.descricao, p.descr, p.titulo, p.label, p.nomeProduto,
    p.produto?.nome, p.produto?.descricao, p.item?.nome
  );
  const unidade = pickFirst(
    p.unidade, p.unidade_sigla, p.unidadeSigla, p.medida?.sigla, p.unidade?.sigla,
    p.produto?.unidade, p.un // alguns backends mandam "un"
  );
  const categoria = pickFirst(
    p.categoria, p.categoria_nome, p.categoriaNome, p.categoria?.nome,
    p.grupo, p.grupo?.nome, p.setor, p.tipo, p.classe, p.departamento,
    p.produto?.categoria, ""
  );
  const tagsArr = pickFirst(p.tags, p.etiquetas, p.labels, p.rotulos, p.marcadores, []) || [];
  const saldoRaw = pickFirst(p.saldo, p.qtd, p.quantidade, p.estoque, p.qtd_disponivel, p.saldoAtual);
  const saldo = Number.isFinite(+saldoRaw) ? +saldoRaw : undefined;
  return { id, nome, unidade, categoria, saldo, tags: Array.isArray(tagsArr) ? tagsArr : [] };
};

const isFarmaciaOuRepro = (cat) => {
  const s = ascii(cat);
  return s.includes("farmac") || s.includes("reproduc") || s.includes("repro") || s.includes("vet");
};
const isSemen = (p) => {
  const n = ascii(p.nome), c = ascii(p.categoria), t = ascii((p.tags || []).join(" "));
  return n.includes("semen") || c.includes("semen") || t.includes("semen");
};
const dedupBy = (arr, keyFn) => { const m=new Map(); for(const it of arr){ const k=keyFn(it); if(!m.has(k)) m.set(k,it);} return [...m.values()]; };
const nameFromOptionLabel = (label) => String(label).split(" (")[0].split(" • ")[0];

/* react-select styles */
const selectStyles = {
  control: (base,s) => ({ ...base, minHeight:40, borderColor: s.isFocused ? "#94a3b8" : "#cbd5e1", boxShadow:"none", "&:hover":{borderColor:"#94a3b8"}, fontSize:14 }),
  valueContainer: (b) => ({ ...b, padding:"0 10px" }),
  indicatorsContainer: (b) => ({ ...b, height:40 }),
  menuPortal: (b) => ({ ...b, zIndex:9999 }),
};

export default function OcorrenciaClinica({ animal, onSubmit }) {
  /* Cabeçalho */
  const [oc, setOc] = useState("Metrite");
  const [obs, setObs] = useState("");

  /* Produtos do estoque */
  const [produtos, setProdutos] = useState([]);

  // evita duplo fetch no StrictMode
  const fetchedOnce = useRef(false);

  useEffect(() => {
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;

    (async () => {
      try {
        const qsFarmRepro = new URLSearchParams({ categorias: "Farmácia,Reprodução", limit: "1000" }).toString();

        // TENTA NESTA ORDEM (primeiro o endpoint que deve ter as categorias)
        const tries = [
          `/api/v1/consumo/estoque?${qsFarmRepro}`,                     // 1) preferencial
          "/api/v1/estoque/produtos?categoria=vet&limit=1000",          // 2) antigo que você usava
          "/api/v1/estoque/produtos?limit=1000",                         // 3) genérico
          "/api/estoque/produtos?categoria=vet&limit=1000",              // 4) fallback sem /v1
          "/api/estoque/produtos?limit=1000",                            // 5) fallback sem /v1
        ];

        let results = [];
        for (const url of tries) {
          try {
            const r = await fetch(url, { headers: { Accept: "application/json" } });
            if (!r.ok) {
              // log de depuração útil, não quebra nada
              console.warn("[OcorrenciaClinica] fetch falhou:", url, r.status);
              continue;
            }
            const j = await r.json();
            const arr = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
            console.log("[OcorrenciaClinica] fetch ok:", url, "itens:", arr.length);
            if (arr.length) { results = arr; break; } // para no primeiro que retorna itens
          } catch (e) {
            console.warn("[OcorrenciaClinica] erro no fetch:", url, e);
          }
        }

        const normalizados = results.map(normalizeProduto).filter(p => p.nome);

        // aplique o filtro de Farmácia/Reprodução só se houver itens com essas categorias
        const anyFarmRepro = normalizados.some(p => {
          const s = ascii(p.categoria);
          return s.includes("farmac") || s.includes("reproduc") || s.includes("repro");
        });

        let filtrados = anyFarmRepro
          ? normalizados.filter(p => isFarmaciaOuRepro(p.categoria))
          : normalizados;

        // remova sêmen
        filtrados = filtrados.filter(p => !isSemen(p));

        setProdutos(dedupBy(filtrados, (p) => `${p.id ?? "noid"}::${p.nome}`));
      } catch (e) {
        console.warn("[OcorrenciaClinica] erro geral carregando estoque:", e);
        setProdutos([]); // ainda permite digitar manualmente
      }
    })();
  }, []);

  /* opções fixas */
  const ocorrenciaOptions = useMemo(() => OCORRENCIAS.map(o => ({ value:o, label:o })), []);
  const viaOptions = useMemo(() => VIAS.map(v => ({ value:v, label:v })), []);
  const unidadeOptions = useMemo(() => UNIDADES.map(u => ({ value:u, label:u })), []);

  const produtoOptions = useMemo(() => {
    if (!Array.isArray(produtos) || produtos.length === 0) return [];
    return produtos.map((p) => {
      const nome = p.nome || "(sem nome)";
      const un = p.unidade ? ` (${p.unidade})` : "";
      const saldo = Number.isFinite(p.saldo) ? ` • saldo: ${p.saldo}` : "";
      const value = p.id ?? `name:${nome}`;
      return { value, label: `${nome}${un}${saldo}`, raw: p };
    });
  }, [produtos]);

  /* Tratamentos (opcional) */
  const [showTrat, setShowTrat] = useState(false);
  const [items, setItems] = useState([]);
  const novaLinha = () => ({
    id: crypto.randomUUID(),
    produtoId: "", produtoNome: "", _optLabel: "",
    dose: "", unidade: "", via: "",
    inicioData: todayBR(), inicioHora: "08:00",
    intervaloHoras: "", repeticoes: "",
    obs: "",
  });
  const add = () => setItems(prev => { if (!showTrat) setShowTrat(true); return [...prev, novaLinha()]; });
  const upd = (id, patch) => setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  const del = (id) => setItems(prev => prev.filter(it => it.id !== id));

  const [agendar, setAgendar] = useState(true);
  const [baixarEstoque, setBaixarEstoque] = useState(true);

  const calcBaixa = (it) => {
    const dose = Number(it.dose), reps = Number(it.repeticoes);
    if (!Number.isFinite(dose) || !Number.isFinite(reps)) return 0;
    return Math.max(0, dose * reps);
  };

  const makeAgendaLabel = (it) => {
    const nome =
      it.produtoId?.startsWith("custom:") || it.produtoId?.startsWith("name:")
        ? it.produtoNome || nameFromOptionLabel(it._optLabel || "")
        : produtos.find(p => (p.id ?? `name:${p.nome}`) === it.produtoId)?.nome || it.produtoNome || "";
    const qtd = [it.dose, it.unidade].filter(Boolean).join(" ");
    const viaTxt = it.via ? ` via ${it.via}` : "";
    return `Aplicar ${qtd} de ${nome}${viaTxt}`;
  };

  const gerarAgendaDoItem = (it) => {
    const baseDate = parseBR(it.inicioData) ?? new Date();
    const [hh = 8, mm = 0] = String(it.inicioHora || "08:00").split(":").map(n => +n);
    baseDate.setHours(hh, mm, 0, 0);
    const reps = Math.max(1, Number(it.repeticoes) || 1);
    const gap = Math.max(1, Number(it.intervaloHoras) || 24);
    const eventos = [];
    for (let i = 0; i < reps; i++) {
      const d = addHours(baseDate, i * gap);
      const whenISO = `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
      eventos.push({ whenISO, title: makeAgendaLabel(it), notes: it.obs || "" });
    }
    return { eventos, iso_list: eventos.map(e => e.whenISO) };
  };

  const salvar = () => {
    if (!oc) return alert("Escolha a ocorrência.");
    if (showTrat && !items.length) return alert("Adicione ao menos 1 tratamento ou oculte a seção.");
    for (const it of items) {
      if (!it.produtoId) return alert("Selecione/Informe o produto em todas as linhas.");
      if (!it.dose) return alert("Informe a quantidade (dose).");
      if (!it.unidade) return alert("Selecione a unidade.");
      if (!it.repeticoes || !it.intervaloHoras) return alert("Preencha Nº de aplicações e Intervalo (h).");
    }

    const tratamentos = items.map((it) => {
      const { eventos, iso_list } = gerarAgendaDoItem(it);
      const isIdless = String(it.produtoId).startsWith("custom:") || String(it.produtoId).startsWith("name:");
      const resolvedNome =
        it.produtoNome ||
        nameFromOptionLabel(it._optLabel || "") ||
        produtos.find(p => (p.id ?? `name:${p.nome}`) === it.produtoId)?.nome || "";

      return {
        produto_id: isIdless ? null : it.produtoId,
        produto_nome: isIdless ? resolvedNome : undefined,
        dose: Number(it.dose),
        unidade: it.unidade || "",
        via: it.via || "",
        repeticoes: Number(it.repeticoes),
        intervalo_horas: Number(it.intervaloHoras),
        inicio_iso: iso_list[0]?.slice(0,10) || toISODate(parseBR(it.inicioData) ?? new Date()),
        agenda_execucoes: showTrat && agendar ? iso_list : [],
        agenda_eventos: showTrat && agendar ? eventos : [],
        obs: it.obs || "",
        baixa_total: showTrat && baixarEstoque ? calcBaixa(it) : 0,
      };
    });

    onSubmit?.({
      kind: "CLINICA",
      clin: oc,
      obs,
      tratamentos,
      criarAgenda: !!(showTrat && agendar),
      baixarEstoque: !!(showTrat && baixarEstoque),
    });
  };

  /* render */
  const selectedOc = useMemo(() => ocorrenciaOptions.find(o => o.value === oc) || null, [ocorrenciaOptions, oc]);

  return (
    <div className="space-y-3">
      {/* Ocorrência + Observação */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-4">
          <label className="block text-sm font-semibold mb-1">Ocorrência</label>
          <Select
            classNamePrefix="rs"
            styles={selectStyles}
            options={ocorrenciaOptions}
            value={selectedOc}
            onChange={(opt)=>setOc(opt?.value || "Metrite")}
            isClearable={false}
            placeholder="Selecione…"
            menuPortalTarget={typeof document!=="undefined"?document.body:null}
            menuPosition="fixed"
          />
        </div>
        <div className="col-span-8">
          <label className="block text-sm font-semibold mb-1">Observação</label>
          <input
            className="w-full border rounded px-3 py-2 text-[14px]"
            placeholder="Obs./tratamento"
            value={obs}
            onChange={(e)=>setObs(e.target.value)}
          />
        </div>
      </div>

      {/* Botões */}
      <div className="flex justify-end gap-2">
        {showTrat && <button className="botao-cancelar pequeno" onClick={()=>setShowTrat(false)}>Ocultar</button>}
        <button className="botao-acao pequeno" onClick={add}>+ Adicionar tratamento</button>
      </div>

      {/* Cartões de tratamento */}
      {showTrat && (
        <div className="space-y-3">
          {items.map((it) => {
            const selectedVia = it.via ? { value: it.via, label: it.via } : null;
            const selectedUn  = it.unidade ? { value: it.unidade, label: it.unidade } : null;

            return (
              <div key={it.id} className="border border-gray-200 rounded-xl p-3">
                {/* LINHA 1: Produto */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12">
                    <label className="block text-sm font-semibold mb-1">Produto</label>
                    <CreatableSelect
                      classNamePrefix="rs"
                      styles={selectStyles}
                      options={produtoOptions}
                      value={
                        it.produtoId?.startsWith("custom:") || it.produtoId?.startsWith("name:")
                          ? {
                              value: it.produtoId,
                              label:
                                it.produtoNome ||
                                nameFromOptionLabel(it._optLabel || "") ||
                                it.produtoId.slice(it.produtoId.indexOf(":")+1),
                            }
                          : produtoOptions.find(o => o.value === it.produtoId) || null
                      }
                      onChange={(opt) => {
                        if (!opt) { upd(it.id, { produtoId:"", produtoNome:"", _optLabel:"" }); return; }
                        const val = String(opt.value);
                        if (val.startsWith("name:")) {
                          upd(it.id, { produtoId: val, produtoNome: nameFromOptionLabel(opt.label), _optLabel: opt.label });
                          return;
                        }
                        const p = produtos.find(x => (x.id ?? `name:${x.nome}`) === val);
                        upd(it.id, { produtoId: val, produtoNome:"", _optLabel: opt.label, unidade: p?.unidade || it.unidade });
                      }}
                      onCreateOption={(input)=>{ const id=`custom:${input}`; upd(it.id,{produtoId:id,produtoNome:input,_optLabel:input}); }}
                      isSearchable
                      placeholder="Selecione ou digite…"
                      noOptionsMessage={()=>"Nenhuma opção"}
                      formatCreateLabel={(input)=>`Usar "${input}" (produto livre)`}
                      menuPortalTarget={typeof document!=="undefined"?document.body:null}
                      menuPosition="fixed"
                    />
                  </div>
                </div>

                {/* LINHA 2: Quantidade | Via | Aplicações */}
                <div className="grid grid-cols-12 gap-3 mt-3">
                  <div className="col-span-5">
                    <label className="block text-sm font-semibold mb-1">Quantidade</label>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 border rounded px-2 py-2 text-[14px]"
                        value={it.dose}
                        onChange={(e)=>upd(it.id,{dose:e.target.value.replace(",",".")})}
                        placeholder="ex.: 20"
                      />
                      <div className="w-28">
                        <Select
                          classNamePrefix="rs"
                          styles={selectStyles}
                          options={unidadeOptions}
                          value={selectedUn}
                          onChange={(opt)=>upd(it.id,{unidade: opt?.value || ""})}
                          isClearable
                          placeholder="Unid."
                          menuPortalTarget={typeof document!=="undefined"?document.body:null}
                          menuPosition="fixed"
                        />
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">Ex.: <b>20 mL</b> (aparece no calendário).</div>
                  </div>

                  <div className="col-span-3">
                    <label className="block text-sm font-semibold mb-1">Via</label>
                    <Select
                      classNamePrefix="rs"
                      styles={selectStyles}
                      options={viaOptions}
                      value={selectedVia}
                      onChange={(opt)=>upd(it.id,{via: opt?.value || ""})}
                      isClearable
                      placeholder="Selecione…"
                      menuPortalTarget={typeof document!=="undefined"?document.body:null}
                      menuPosition="fixed"
                    />
                  </div>

                  <div className="col-span-4">
                    <label className="block text-sm font-semibold mb-1">Aplicações</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="w-full border rounded px-2 py-2 text-[14px]"
                        value={it.repeticoes}
                        onChange={(e)=>upd(it.id,{repeticoes:e.target.value})}
                        placeholder="Nº (ex.: 5)"
                      />
                      <input
                        className="w-full border rounded px-2 py-2 text-[14px]"
                        value={it.intervaloHoras}
                        onChange={(e)=>upd(it.id,{intervaloHoras:e.target.value})}
                        placeholder="Intervalo (h)"
                      />
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">
                      Ex.: <b>3</b> aplicações a cada <b>24h</b>.{" "}
                      {duracaoTotalTexto(it.repeticoes, it.intervaloHoras) && <>Duração total: <b>{duracaoTotalTexto(it.repeticoes, it.intervaloHoras)}</b>.</>}
                    </div>
                  </div>
                </div>

                {/* LINHA 3: Início | Obs | Total/Remover */}
                <div className="grid grid-cols-12 gap-3 mt-3 items-end">
                  <div className="col-span-4">
                    <label className="block text-sm font-semibold mb-1">Início</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="w-full border rounded px-2 py-2 text-[14px]"
                        value={it.inicioData}
                        onChange={(e)=>upd(it.id,{inicioData:e.target.value})}
                        placeholder="dd/mm/aaaa"
                      />
                      <input
                        className="w-full border rounded px-2 py-2 text-[14px]"
                        value={it.inicioHora}
                        onChange={(e)=>upd(it.id,{inicioHora:e.target.value})}
                        placeholder="hh:mm"
                      />
                    </div>
                  </div>

                  <div className="col-span-6">
                    <label className="block text-sm font-semibold mb-1">Obs. da linha</label>
                    <input
                      className="w-full border rounded px-2 py-2 text-[14px]"
                      value={it.obs}
                      onChange={(e)=>upd(it.id,{obs:e.target.value})}
                      placeholder="Observações específicas deste produto…"
                    />
                  </div>

                  <div className="col-span-2 flex items-end justify-between">
                    <div className="text-sm text-gray-600">Total p/ baixa: <b>{calcBaixa(it)}</b> {it.unidade || ""}</div>
                    <button className="botao-cancelar pequeno" onClick={()=>del(it.id)} disabled={items.length===1}>Remover</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Flags e ação */}
      <div className="flex items-center gap-4 pt-1">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={agendar}
            onChange={(e)=>setAgendar(e.target.checked)}
            disabled={!showTrat || items.length===0}
          />
          Lançar doses no calendário/tarefas
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={baixarEstoque}
            onChange={(e)=>setBaixarEstoque(e.target.checked)}
            disabled={!showTrat || items.length===0}
          />
          Baixar do estoque ao salvar
        </label>
      </div>

      <div className="flex justify-end">
        <button className="botao-acao" onClick={salvar}>Registrar ocorrência</button>
      </div>
    </div>
  );
}
