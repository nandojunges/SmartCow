import { useState } from 'react';
import { Gift, Star, Rocket, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '../../styles/planos.css';

const planos = [
  {
    id: 'teste_gratis',
    nome: 'Teste Grátis',
    descricao: 'Aproveite 7 dias gratuitamente',
    beneficios: ['Acesso limitado', 'Sem suporte', 'Expira após 7 dias'],
    cor: '#3b82f6',
    Icon: Gift,
  },
  {
    id: 'basico',
    nome: 'Básico',
    descricao: 'Funcionalidades essenciais',
    beneficios: ['Controle de tarefas', 'Cadastro de vacas', 'Exportação de dados'],
    cor: '#10b981',
    Icon: Star,
  },
  {
    id: 'intermediario',
    nome: 'Intermediário',
    descricao: 'Inclui bezerras, reprodução e estoque',
    beneficios: ['Tudo do Básico', 'Gestão de bezerras', 'Reprodução avançada'],
    cor: '#f59e0b',
    Icon: Rocket,
  },
  {
    id: 'completo',
    nome: 'Completo',
    descricao: 'Relatórios, gráficos e tudo incluso',
    beneficios: ['Tudo do Intermediário', 'Gráficos completos', 'Relatórios PDF'],
    cor: '#8b5cf6',
    Icon: Crown,
  },
];

function EscolherPlanoCadastro() {
  const [planoSelecionado, setPlanoSelecionado] = useState(null);
  const [formaPagamento, setFormaPagamento] = useState('');
  const [mostrarModal, setMostrarModal] = useState(false);

  const valoresPlano = {
    teste_gratis: 0,
    basico: 19.9,
    intermediario: 29.9,
    completo: 39.9,
  };

  const navegar = useNavigate();

  return (
    <>
      {mostrarModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: '30px',
              borderRadius: '15px',
              maxWidth: '400px',
              width: '90%',
              textAlign: 'center',
            }}
          >
            <h2
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                marginBottom: '10px',
              }}
            >
              Confirmar Plano
            </h2>
            <p>
              Você selecionou o plano <strong>{planoSelecionado}</strong>.
            </p>
            <p>
              {planoSelecionado === 'teste_gratis'
                ? 'Esse plano é gratuito por 7 dias.'
                : `Valor: R$ ${valoresPlano[planoSelecionado].toFixed(2)} / mês`}
            </p>
            {planoSelecionado !== 'teste_gratis' && (
              <select
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                style={{
                  marginTop: '10px',
                  padding: '8px',
                  borderRadius: '10px',
                  border: '1px solid #ccc',
                  width: '100%',
                }}
              >
                <option value="">Escolha a forma de pagamento</option>
                <option value="pix">Pix</option>
                <option value="boleto">Boleto</option>
                <option value="cartao">Cartão</option>
              </select>
            )}
            <div
              style={{
                marginTop: '20px',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <button
                onClick={() => setMostrarModal(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ccc',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (planoSelecionado !== 'teste_gratis' && !formaPagamento) {
                    alert('Selecione uma forma de pagamento');
                    return;
                  }
                  const queryParams = new URLSearchParams({
                    plano: planoSelecionado,
                    pagamento: formaPagamento,
                  }).toString();
                  navegar(`/cadastro?${queryParams}`);
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#1565c0',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pagina-escolher-plano">
        <div className="painel-planos">
          <h1>Escolha seu Plano</h1>
          <p>Selecione o plano desejado para concluir o cadastro.</p>
          <div className="grid-planos">
            {planos.map((plano) => (
              <div key={plano.id} className="card-plano-modern">
                <plano.Icon size={40} color={plano.cor} />
                <h3>{plano.nome}</h3>
                <p>{plano.descricao}</p>
                <ul className="lista-beneficios">
                  {plano.beneficios.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <button
                  onClick={() => {
                    setPlanoSelecionado(plano.id);
                    setMostrarModal(true);
                  }}
                  className="btn-escolher-moderno"
                  style={{ backgroundColor: plano.cor }}
                >
                  Escolher
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default EscolherPlanoCadastro;

