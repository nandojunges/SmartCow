import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function EscolherPlanoCadastro() {
  const navigate = useNavigate();

  const planos = [
    {
      nome: 'Teste Grátis',
      cor: 'bg-blue-500',
      preco: 0,
      beneficios: ['Aproveite 7 dias gratuitamente', 'Acesso limitado', 'Sem suporte'],
    },
    {
      nome: 'Básico',
      cor: 'bg-green-500',
      preco: 19.90,
      beneficios: ['Funcionalidades essenciais', 'Cadastro de vacas', 'Exportação de dados'],
    },
    {
      nome: 'Intermediário',
      cor: 'bg-orange-500',
      preco: 39.90,
      beneficios: ['Inclui bezerras, reprodução e estoque'],
    },
    {
      nome: 'Completo',
      cor: 'bg-purple-600',
      preco: 59.90,
      beneficios: ['Relatórios, gráficos e tudo incluso', 'Gráficos completos', 'Relatórios PDF'],
    },
  ];

  const [planoSelecionado, setPlanoSelecionado] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState('Boleto');

  const abrirModal = (plano) => {
    setPlanoSelecionado(plano);
    setMostrarModal(true);
  };

  const confirmarPlano = () => {
    localStorage.setItem('planoEscolhido', planoSelecionado.nome);
    localStorage.setItem('pagamentoEscolhido', formaPagamento);
    localStorage.setItem('valorPlano', planoSelecionado.preco.toFixed(2));
    setMostrarModal(false);
    navigate(`/cadastro?plano=${encodeURIComponent(planoSelecionado.nome)}`);
  };

  return (
    <div className="pagina-escolher-plano">
      <div className="painel-planos">
        <h2 className="titulo">Escolha seu Plano</h2>
        <p className="text-center text-sm text-gray-600 mb-6">
          Selecione o plano desejado para concluir o cadastro.
        </p>

        <div className="grid-planos">
          {planos.map((plano, index) => (
            <div key={index} className="card-plano-modern">
              <div className={`faixa-superior ${plano.cor}`}></div>
              <h2>{plano.nome}</h2>
              <p className="preco">
                {plano.preco === 0 ? 'Gratuito' : `R$ ${plano.preco.toFixed(2)}/mês`}
              </p>
              <ul className="lista-beneficios">
                {plano.beneficios.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
              <button
                className={`btn-escolher-moderno ${plano.cor}`}
                onClick={() => abrirModal(plano)}
              >
                Escolher
              </button>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-center gap-4 items-center">
          <label className="text-sm font-medium">Forma de pagamento:</label>
          <select
            value={formaPagamento}
            onChange={(e) => setFormaPagamento(e.target.value)}
            className="border rounded-md px-3 py-1"
          >
            <option value="Boleto">Boleto</option>
            <option value="Pix">Pix</option>
            <option value="Cartão">Cartão</option>
          </select>
        </div>
      </div>

      {/* Modal embutido no mesmo componente */}
      {mostrarModal && planoSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold text-center mb-4">Confirmar Plano</h2>
            <p className="text-center mb-3">
              Você escolheu o plano <strong>{planoSelecionado.nome}</strong>
              <br />
              Valor: <strong>{planoSelecionado.preco === 0 ? 'Gratuito' : `R$ ${planoSelecionado.preco.toFixed(2)}/mês`}</strong>
              <br />
              Pagamento via: <strong>{formaPagamento}</strong>
            </p>
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => setMostrarModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarPlano}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

