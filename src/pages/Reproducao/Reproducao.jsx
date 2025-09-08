// src/pages/Reproducao/Reproducao.jsx
// -----------------------------------------------------------------------------
// Abas de Reprodução. Sem modal aqui — o modal mora em Protocolos.jsx.
// Agora com abas: Visão Geral | Protocolos | Cadastro | Relatórios
// -----------------------------------------------------------------------------

import { useState, useEffect } from "react";
import Protocolos from "./Protocolos.jsx";
import VisaoGeral from "./VisaoGeral/VisaoGeral.jsx";
// novas abas
import Cadastro from "./Cadastro.jsx";
import Relatorios from "./Relatorios.jsx";

/* ========================= SubAbasReproducao (chips) ========================= */
function SubAbasReproducao({ selected, setSelected, contadores }) {
  const tabs = [
    { id: "visaoGeral", label: "Visão Geral" },
    { id: "protocolos", label: "Protocolos" },
    { id: "cadastro",   label: "Cadastro" },      // Touros & Inseminadores
    { id: "relatorios", label: "Relatórios" },
  ];

  const onKey = (e) => {
    const idx = tabs.findIndex((t) => t.id === selected);
    if (idx === -1) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setSelected(tabs[(idx + 1) % tabs.length].id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSelected(tabs[(idx - 1 + tabs.length) % tabs.length].id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Sub-abas de reprodução"
      onKeyDown={onKey}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        display: "flex",
        gap: 8,
        padding: 6,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        minHeight: 40,
        alignItems: "center",
        overflowX: "auto",
      }}
    >
      {tabs.map((t) => {
        const active = selected === t.id;
        const qtd = contadores?.[t.id] ?? 0;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            aria-controls={`pane-${t.id}`}
            onClick={() => setSelected(t.id)}
            tabIndex={active ? 0 : -1}
            title={t.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 28,
              padding: "0 12px",
              borderRadius: 999,
              fontSize: 14,
              fontWeight: active ? 700 : 600,
              border: "1px solid",
              borderColor: active ? "#2563eb" : "#e5e7eb",
              background: active ? "#eaf2ff" : "#fff",
              color: active ? "#1e3a8a" : "#334155",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <span>{t.label}</span>
            <span
              style={{
                minWidth: 18,
                height: 18,
                padding: "0 6px",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                background: active ? "#1e40af" : "#e5e7eb",
                color: active ? "#fff" : "#111827",
              }}
            >
              {qtd}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ============================== Componente raiz ============================== */
export default function Reproducao() {
  const [abaAtiva, setAbaAtiva] = useState("visaoGeral");
  const [contadores, setContadores] = useState({
    visaoGeral: 0,
    protocolos: 0,
    cadastro: 0,
    relatorios: 0,
  });

  // callbacks de ações da Visão Geral (plugue suas modais reais depois)
  const handleRegistrar = (animal) => console.log("Registrar:", animal);
  const handleFicha = (animal) => console.log("Ficha:", animal);

  useEffect(() => {
    // exemplo: atualizar números das bolinhas se precisar
  }, []);

  const renderizarConteudo = () => {
    switch (abaAtiva) {
      case "visaoGeral":
        return (
          <VisaoGeral
            animais={[]} // plugue seus dados reais
            onCountChange={(n) =>
              setContadores((p) => ({ ...p, visaoGeral: n }))
            }
            onRegistrar={handleRegistrar}
            onFicha={handleFicha}
          />
        );

      case "protocolos":
        // O modal vive dentro de Protocolos.jsx (não aqui).
        return (
          <Protocolos
            onCountChange={(n) =>
              setContadores((p) => ({ ...p, protocolos: n }))
            }
          />
        );

      case "cadastro":
        // Cadastro de Touros & Inseminadores
        return (
          <Cadastro
            onCountChange={(n) => // opcional: se implementar no componente
              setContadores((p) => ({ ...p, cadastro: n ?? p.cadastro }))
            }
          />
        );

      case "relatorios":
        // Relatórios de concepção por touro / inseminador / mensal
        return (
          <Relatorios
            onCountChange={(n) => // opcional
              setContadores((p) => ({ ...p, relatorios: n ?? p.relatorios }))
            }
          />
        );

      default:
        return null;
    }
  };

  return (
    <div
      className="w-full"
      style={{
        background: "#fff",
        borderRadius: 16,
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
      }}
    >
      <SubAbasReproducao
        selected={abaAtiva}
        setSelected={setAbaAtiva}
        contadores={contadores}
      />
      <div
        id={`pane-${abaAtiva}`}
        role="tabpanel"
        aria-labelledby={abaAtiva}
        style={{ padding: 12 }}
      >
        {renderizarConteudo()}
      </div>
    </div>
  );
}
