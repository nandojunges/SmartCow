import { useState } from 'react';
import { Gift, Star, Rocket, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
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
  const [formaPagamento, setFormaPagamento] = useState('cartao');
  const navigate = useNavigate();

  const selecionarPlano = (plano) => {
    setPlanoSelecionado(plano);
    setFormaPagamento('cartao');
  };

  const cancelar = () => {
    setPlanoSelecionado(null);
  };

  const finalizar = async () => {
    if (!planoSelecionado) return;
    try {
      await api.post('/auth/finalizar-cadastro', {
        token: localStorage.getItem('tokenCadastro'),
        plano: planoSelecionado.id,
        formaPagamento: planoSelecionado.id === 'teste_gratis' ? null : formaPagamento,
      });
      localStorage.clear();
      alert('Cadastro finalizado com sucesso!');
      navigate('/login');
    } catch (err) {
      console.error('Erro ao finalizar cadastro', err);
    }
  };

  return (
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
                className="btn-escolher-moderno"
                style={{ backgroundColor: plano.cor }}
                onClick={() => selecionarPlano(plano)}
              >
                Escolher
              </button>
            </div>
          ))}
        </div>

        {planoSelecionado && (
          planoSelecionado.id === 'teste_gratis' ? (
            <div className="acoes-teste-gratis">
              <button className="botao-acao" onClick={finalizar}>
                Confirmar
              </button>
              <button className="botao-cancelar" onClick={cancelar}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="painel-pagamento">
              <select
                className="select-pagamento"
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
              >
                <option value="cartao">Cartão de crédito</option>
                <option value="boleto">Boleto</option>
                <option value="pix">Pix</option>
              </select>
              <div className="botoes-pagamento">
                <button className="botao-cancelar" onClick={cancelar}>
                  Cancelar
                </button>
                <button className="botao-acao" onClick={finalizar}>
                  Confirmar
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default EscolherPlanoCadastro;

