// src/pages/Animais/Animais.jsx
import React, { useState, useEffect } from 'react';
import {
  ListChecks,
  PlusCircle,
  ArrowRightCircle,
  Ban,
  FileText,
  UploadCloud,
  DownloadCloud,
} from 'lucide-react';

// Páginas
import SubAbasAnimais from './SubAbasAnimais';
import SaidaAnimal from './SaidaAnimal';
import Inativas from './Inativas';
import CadastroAnimal from './CadastroAnimal';
import FichaAnimal from './FichaAnimal/FichaAnimal'; // << adicionada
import { getAnimais } from '../../api';

/* ---------------------------
   🎨 Personalização central
---------------------------- */
const estilos = {
  larguraExpandida: '130px',
  larguraRecolhida: '50px',
  alturaBotao: '50px',
  espacoEntreBotoes: '10px',
  iconeExpandido: 24,
  iconeRecolhido: 36,
  corAtivo: 'bg-white text-blue-900 shadow-md',
  corInativo: 'bg-gray-100 text-black',
  fonte: 'Poppins, sans-serif',
};

const icones = {
  todos: <ListChecks />,
  entrada: <PlusCircle />,
  saida: <ArrowRightCircle />,
  inativas: <Ban />,
  relatorio: <FileText />,
  importar: <UploadCloud />,
  exportar: <DownloadCloud />,
};

/* -----------------------------------------
   Barra Lateral
------------------------------------------ */
function ModalLateralAnimais({ abaAtiva, setAbaAtiva, expandido }) {
  const botoes = [
    { id: 'todos', label: 'Todos os Animais' },
    { id: 'entrada', label: 'Entrada de Animais' },
    { id: 'saida', label: 'Saída de Animais' },
    { id: 'inativas', label: 'Inativas' },
    { id: 'relatorio', label: 'Relatórios' },
    { id: 'importar', label: 'Importar Dados' },
    { id: 'exportar', label: 'Exportar Dados' },
  ];

  return (
    <div
      className="flex flex-col pt-6 px-0 items-stretch"
      style={{ gap: estilos.espacoEntreBotoes, fontFamily: estilos.fonte, paddingLeft: 0, paddingRight: 0 }}
    >
      {botoes.map((btn) => {
        const ativo = abaAtiva === btn.id;
        return (
          <button
            key={btn.id}
            onClick={() => setAbaAtiva(btn.id)}
            title={btn.label}
            className={`flex items-center group transition-all duration-300 ease-in-out transform
              rounded-r-full
              ${ativo ? estilos.corAtivo : estilos.corInativo}
              hover:bg-white hover:text-blue-900 hover:shadow-md`}
            style={{
              height: estilos.alturaBotao,
              width: expandido ? estilos.larguraExpandida : estilos.larguraRecolhida,
              minWidth: '44px',
              justifyContent: expandido ? 'flex-start' : 'center',
              borderTopLeftRadius: '0px',
              borderBottomLeftRadius: '0px',
              borderTopRightRadius: '9999px',
              borderBottomRightRadius: '9999px',
              paddingLeft: expandido ? '12px' : '0',
              paddingRight: expandido ? '12px' : '0',
              fontSize: '14px',
              position: 'relative',
            }}
          >
            {ativo && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-blue-800" />
            )}
            <span
              className="flex items-center justify-center"
              style={{ transform: expandido ? 'scale(1)' : 'scale(1.2)' }}
            >
              {React.cloneElement(icones[btn.id], {
                size: expandido ? estilos.iconeExpandido : estilos.iconeRecolhido,
              })}
            </span>
            <span
              className="ml-2 overflow-hidden transition-all duration-300 ease-in-out group-hover:font-bold"
              style={{
                opacity: expandido ? 1 : 0,
                maxWidth: expandido ? '160px' : '0px',
                transform: expandido ? 'translateX(0)' : 'translateX(-8px)',
                fontWeight: ativo ? 700 : undefined,
              }}
            >
              {btn.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------
   Componente principal
-------------------------- */
export default function Animais() {
  const [abaAtiva, setAbaAtiva] = useState('todos');
  const [animais, setAnimais] = useState([]);
  const [expandido, setExpandido] = useState(false);

  // estado/modal da ficha
  const [fichaOpen, setFichaOpen] = useState(false);
  const [animalFicha, setAnimalFicha] = useState(null);

  const carregar = async () => {
    try {
      const { items } = await getAnimais();
      setAnimais(items || []);
    } catch (err) {
      console.error('Erro ao carregar animais:', err);
    }
  };

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    const handler = () => carregar();
    const abrirFicha = (e) => {
      const animal = e?.detail?.animal;
      if (animal) { setAnimalFicha(animal); setFichaOpen(true); }
    };
    window.addEventListener('animaisAtualizados', handler);
    window.addEventListener('animais:refresh', handler);
    window.addEventListener('abrirFichaAnimal', abrirFicha); // fallback vindo do Inativas
    return () => {
      window.removeEventListener('animaisAtualizados', handler);
      window.removeEventListener('animais:refresh', handler);
      window.removeEventListener('abrirFichaAnimal', abrirFicha);
    };
  }, []);

  // Callback padrão que o Inativas/Plantel podem chamar.
  // Aceita nova lista OU recarrega do backend se nada for passado.
  const handleAtualizar = (novaLista) => {
    if (Array.isArray(novaLista)) {
      setAnimais(novaLista);
      window.dispatchEvent(new Event('animaisAtualizados'));
    } else {
      carregar();
    }
  };

  const handleVerFicha = (animal) => {
    setAnimalFicha(animal);
    setFichaOpen(true);
  };

  const renderizarPrincipal = () => {
    switch (abaAtiva) {
      case 'todos':
        return <SubAbasAnimais animais={animais} onRefresh={carregar} />;

      case 'entrada':
        return <CadastroAnimal animais={animais} onAtualizar={carregar} />;

      case 'saida':
        return <SaidaAnimal animais={animais} onAtualizar={carregar} />;

      case 'inativas':
        return (
          <Inativas
            animais={animais}
            onAtualizar={handleAtualizar}
            onVerFicha={handleVerFicha}
          />
        );

      case 'relatorio':
        return <div className="p-4">Relatórios — Em breve…</div>;

      case 'importar':
        return <div className="p-4">Importar Dados — Em breve…</div>;

      case 'exportar':
        return <div className="p-4">Exportar Dados — Em breve…</div>;

      default:
        return <div className="p-4">Em breve…</div>;
    }
  };

  const larguraFechada = 60;
  const larguraAberta = 140;
  const ALTURA_TOPO = 150;
  const COR_BARRA = '#1c3586';

  return (
    <div className="h-screen">
      {/* Barra lateral fixa */}
      <div
        className="fixed left-0 transition-all duration-300 ease-in-out z-50"
        onMouseEnter={() => setExpandido(true)}
        onMouseLeave={() => setExpandido(false)}
        style={{
          top: ALTURA_TOPO,
          width: expandido ? larguraAberta : larguraFechada,
          height: `calc(100vh - ${ALTURA_TOPO}px)`,
          backgroundColor: COR_BARRA,
          color: '#fff',
          boxShadow: 'none',
        }}
      >
        <ModalLateralAnimais
          abaAtiva={abaAtiva}
          setAbaAtiva={setAbaAtiva}
          expandido={expandido}
        />
      </div>

      {/* Conteúdo principal */}
      <div
        className="overflow-auto"
        style={{
          marginLeft: expandido ? larguraAberta : larguraFechada,
          paddingLeft: 24,
          paddingTop: 16,
          height: '100vh',
          transition: 'margin-left .3s ease',
        }}
      >
        {renderizarPrincipal()}
      </div>

      {/* Modal da ficha (reutilizado por qualquer aba) */}
      {fichaOpen && animalFicha && (
        <FichaAnimal
          animal={animalFicha}
          onClose={() => { setFichaOpen(false); setAnimalFicha(null); }}
        />
      )}
    </div>
  );
}
