import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import Select from 'react-select';
import InputMask from 'react-input-mask';
import { Eye, EyeOff } from 'lucide-react';
import api from '../../api';
import VerificacaoEmail from '../../components/VerificacaoEmail';
import CarrosselLogos from "../../components/CarrosselLogos";

function Cadastro() {
  const [searchParams] = useSearchParams();
  const planoParam = searchParams.get('plano');
  const pagamentoParam = searchParams.get('pagamento');
  const navigate = useNavigate();

  const [plano] = useState(planoParam || '');
  const [nome, setNome] = useState('');
  const [nomeFazenda, setNomeFazenda] = useState('');
  const [email, setEmail] = useState('');
  const [verificado, setVerificado] = useState(false);
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState(pagamentoParam || '');
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!plano) navigate('/escolher-plano');
  }, [plano, navigate]);

  const validar = () => {
    if (!nome || !nomeFazenda || !email || !telefone || !senha || !confirmarSenha)
      return 'Preencha todos os campos';
    if (!/\S+@\S+\.\S+/.test(email)) return 'Email inválido';
    if (senha !== confirmarSenha) return 'As senhas não coincidem';
    if (senha.length < 6) return 'A senha deve ter no mínimo 6 caracteres';
    const tel = telefone.replace(/\D/g, '');
    if (tel.length < 10) return 'Telefone inválido';
    if (plano !== 'Teste Grátis' && !formaPagamento) return 'Selecione uma forma de pagamento';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const msg = validar();
    if (msg) {
      setErro(msg);
      return;
    }
    setErro('');
    try {
      const payload = {
        nome,
        nomeFazenda,
        email,
        telefone,
        senha,
        plano,
        formaPagamento,
      };
      await api.post('/auth/cadastrar', payload);
      navigate('/');
    } catch {
      setErro('Erro no cadastro');
    }
  };

  const formasPagamento = [
    { value: 'pix', label: 'Pix' },
    { value: 'boleto', label: 'Boleto' },
    { value: 'cartao', label: 'Cartão' },
  ];

  const inputStyle = {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #ccc',
  };

  const iconButtonStyle = {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  };

  const camposValidos =
    nome &&
    nomeFazenda &&
    email &&
    telefone &&
    senha &&
    confirmarSenha &&
    verificado &&
    (plano === 'Teste Grátis' || formaPagamento);

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: "url('/icones/telafundo.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        margin: 0,
        padding: 0,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: 'rgba(255,255,255,0.85)',
          padding: '40px',
          borderRadius: '20px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
          maxWidth: '500px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h2 style={{ textAlign: 'center' }}>SmartMilk</h2>
        <p className="text-center text-sm text-gray-600">Bem-vindo ao Gestão Leiteira</p>
        <CarrosselLogos />
        {erro && (
          <p style={{ color: 'red', textAlign: 'center', marginBottom: '8px' }}>{erro}</p>
        )}
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome"
          style={inputStyle}
        />
        <input
          type="text"
          value={nomeFazenda}
          onChange={(e) => setNomeFazenda(e.target.value)}
          placeholder="Nome da fazenda"
          style={inputStyle}
        />
        <VerificacaoEmail
          email={email}
          setEmail={setEmail}
          onEmailVerificado={setVerificado}
        />
        <InputMask
          mask="(99) 99999-9999"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
        >
          {(inputProps) => (
            <input
              {...inputProps}
              type="text"
              placeholder="Telefone"
              style={inputStyle}
            />
          )}
        </InputMask>
        <div className="input-senha-container" style={{ position: 'relative' }}>
          <input
            className="input-senha"
            type={mostrarSenha ? 'text' : 'password'}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            style={{ ...inputStyle, paddingRight: '40px' }}
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((s) => !s)}
            style={iconButtonStyle}
          >
            {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <div className="input-senha-container" style={{ position: 'relative' }}>
          <input
            className="input-senha"
            type={mostrarConfirmar ? 'text' : 'password'}
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            placeholder="Confirmar senha"
            style={{ ...inputStyle, paddingRight: '40px' }}
          />
          <button
            type="button"
            onClick={() => setMostrarConfirmar((s) => !s)}
            style={iconButtonStyle}
          >
            {mostrarConfirmar ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {plano !== 'Teste Grátis' && !pagamentoParam && (
          <Select
            options={formasPagamento}
            value={formasPagamento.find((o) => o.value === formaPagamento)}
            onChange={(opt) => setFormaPagamento(opt.value)}
            placeholder="Forma de pagamento"
            styles={{
              control: (base) => ({
                ...base,
                borderRadius: '8px',
                borderColor: '#ccc',
              }),
            }}
          />
        )}
        <button
          type="submit"
          disabled={!camposValidos}
          style={{
            backgroundColor: camposValidos ? '#1e3a8a' : '#9ca3af',
            color: '#fff',
            border: 'none',
            borderRadius: '30px',
            padding: '10px',
            width: '60%',
            margin: '20px auto 0',
            cursor: camposValidos ? 'pointer' : 'not-allowed',
            transition: 'background 0.3s',
          }}
          onMouseEnter={(e) =>
            camposValidos && (e.target.style.backgroundColor = '#2563eb')
          }
          onMouseLeave={(e) =>
            (e.target.style.backgroundColor = camposValidos ? '#1e3a8a' : '#9ca3af')
          }
        >
          Cadastrar
        </button>
        <p style={{ textAlign: 'center' }}>
          Já possui conta? <Link to="/">Entrar</Link>
        </p>
      </form>
    </div>
  );
}

export default Cadastro;
