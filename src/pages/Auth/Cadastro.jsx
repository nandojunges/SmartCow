// src/pages/Auth/Cadastro.jsx
import { useState, useEffect } from 'react';
import Select from 'react-select';
import { Eye, EyeOff } from 'lucide-react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiAuth } from '../../api'; // 👈 usa o cliente de AUTH (base /api)

function formatPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*$/, (_, a, b, c) =>
      [a && `(${a})`, b, c && `-${c}`].filter(Boolean).join(' ')
    );
  }
  return d.replace(/^(\d{2})(\d{5})(\d{0,4}).*$/, (_, a, b, c) => `(${a}) ${b}${c ? `-${c}` : ''}`);
}

export default function Cadastro() {
  const [form, setForm] = useState({
    nome: '',
    fazenda: '',
    email: '',
    telefone: '',
    senha: '',
    confirmar: '',
    plano: '',
  });

  const [formaPagamento, setFormaPagamento] = useState(null);
  const opcoesPagamento = [
    { value: 'pix', label: 'Pix' },
    { value: 'boleto', label: 'Boleto' },
    { value: 'cartao', label: 'Cartão' },
  ];

  const [erro, setErro] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const plano = searchParams.get('plano') || 'teste_gratis';
    setForm((f) => ({ ...f, plano }));
  }, [searchParams]);

  const validar = () => {
    if (!form.nome || !form.email || !form.telefone || !form.senha || !form.confirmar) {
      setErro('Preencha todos os campos obrigatórios.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setErro('E-mail inválido.');
      return false;
    }
    const soDigitos = form.telefone.replace(/\D/g, '');
    if (soDigitos.length < 10) {
      setErro('Telefone inválido.');
      return false;
    }
    if (form.senha.length < 6) {
      setErro('A senha deve ter no mínimo 6 caracteres.');
      return false;
    }
    if (form.senha !== form.confirmar) {
      setErro('As senhas não conferem.');
      return false;
    }
    setErro('');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validar()) return;

    try {
      const emailTrim = form.email.trim().toLowerCase();

      // ✅ chama o backend certo: POST /api/auth/register
      const { data, status } = await apiAuth.post('/auth/register', {
        email: emailTrim,
        senha: form.senha,
      });

      // guarda e-mail para a tela de verificação
      localStorage.setItem('emailCadastro', emailTrim);

      // opcional: guardar info adicional para UX futura
      // localStorage.setItem('preCadastroInfo', JSON.stringify({
      //   nome: form.nome,
      //   nomeFazenda: form.fazenda,
      //   telefone: form.telefone.replace(/\D/g, ''),
      //   plano: form.plano,
      //   formaPagamento: form.plano === 'teste_gratis' ? null : formaPagamento?.value,
      // }));

      if (status === 201) {
        toast.success('Cadastro criado! Enviamos um código para o seu e-mail.');
      } else if (status === 200) {
        // caso usuário já exista mas ainda não verificado
        toast.info('Conta já existia e não estava verificada. Novo código enviado ao seu e-mail.');
      }

      navigate('/verificar-email', { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Erro ao cadastrar.';

      if (status === 409) {
        // e-mail já verificado no backend
        toast.error('E-mail já cadastrado. Faça login ou recupere sua senha.');
        navigate('/login');
        return;
      }

      setErro(msg);
    }
  };

  const panelStyle = {
    backgroundColor: 'rgba(255,255,255,0.88)',
    padding: '18px',
    borderRadius: '14px',
    boxShadow: '0 4px 12px rgba(0,0,0,.10)',
    width: 'min(92vw, 520px)',
    maxWidth: '520px',
  };
  const labelStyle = { fontSize: '12px', marginBottom: '4px', color: '#374151', fontWeight: 500 };
  const inputBase = { padding: '8px 12px', borderRadius: 10, border: '1px solid #ccc', fontSize: '0.92rem' };
  const inputSenhaBase = { ...inputBase, padding: '8px 36px 8px 12px' };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        margin: 0,
        padding: 0,
        backgroundImage: "url('/icones/telafundo.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div style={panelStyle}>
        <p style={{ textAlign: 'center', fontSize: '12px', color: '#6b7280', margin: 0 }}>
          Bem-vindo ao Gestão Leiteira
        </p>
        <h2 style={{ textAlign: 'center', fontWeight: 700, fontSize: '18px', margin: '6px 0 10px' }}>
          Cadastro
        </h2>

        {erro && (
          <div style={{ marginBottom: 8, color: '#dc2626', fontSize: 13, textAlign: 'center' }}>
            {erro}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={labelStyle}>Nome</label>
            <div className="input-senha-container">
              <input
                type="text"
                placeholder="Seu Nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className="input-senha"
                style={{ ...inputBase, textTransform: 'capitalize' }}
                autoFocus
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Nome da Fazenda</label>
              <input
                type="text"
                placeholder="Ex: Fazenda Esperança"
                value={form.fazenda}
                onChange={(e) => setForm({ ...form, fazenda: e.target.value })}
                className="input-senha"
                style={{ ...inputBase, textTransform: 'capitalize' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Telefone</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="(99) 99999-9999"
                value={form.telefone}
                onChange={(e) => setForm((f) => ({ ...f, telefone: formatPhone(e.target.value) }))}
                maxLength={16}
                required
                className="input-senha"
                style={inputBase}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>E-mail</label>
            <input
              type="email"
              placeholder="seu@email.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-senha"
              style={inputBase}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="input-senha-container">
              <div style={{ width: '100%' }}>
                <label style={labelStyle}>Senha</label>
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  placeholder="Crie uma senha"
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  className="input-senha input-senha-olho"
                  style={inputSenhaBase}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="botao-olho"
                  style={{ right: 10 }}
                >
                  {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="input-senha-container">
              <div style={{ width: '100%' }}>
                <label style={labelStyle}>Confirmar Senha</label>
                <input
                  type={mostrarConfirmar ? 'text' : 'password'}
                  placeholder="Repita a senha"
                  value={form.confirmar}
                  onChange={(e) => setForm({ ...form, confirmar: e.target.value })}
                  className="input-senha input-senha-olho"
                  style={inputSenhaBase}
                />
                <button
                  type="button"
                  onClick={() => setMostrarConfirmar(!mostrarConfirmar)}
                  className="botao-olho"
                  style={{ right: 10 }}
                >
                  {mostrarConfirmar ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {form.plano && (
            <div style={{ textAlign: 'center', fontSize: 12 }}>
              Plano escolhido: <strong>{form.plano}</strong>{' '}
              <Link to="/escolher-plano" className="text-blue-600 hover:underline">
                Alterar plano
              </Link>
            </div>
          )}

          {form.plano && form.plano !== 'teste_gratis' && (
            <div>
              <label style={labelStyle}>Forma de pagamento</label>
              <Select
                options={opcoesPagamento}
                placeholder="Escolha a forma de pagamento"
                onChange={setFormaPagamento}
                value={formaPagamento}
                menuPortalTarget={document.body}
                menuPosition="fixed"
                styles={{
                  control: (p) => ({
                    ...p, minHeight: 36, height: 36, backgroundColor: 'white',
                    borderColor: '#ccc', borderRadius: 10, fontSize: 14, boxShadow: 'none',
                  }),
                  valueContainer: (p) => ({ ...p, padding: '0 8px' }),
                  indicatorsContainer: (p) => ({ ...p, height: 36 }),
                  dropdownIndicator: (p) => ({ ...p, padding: '0 8px' }),
                  placeholder: (p) => ({ ...p, color: '#888' }),
                  menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                }}
              />
            </div>
          )}

          <button
            type="submit"
            style={{
              backgroundColor: '#1565c0',
              color: '#fff',
              borderRadius: 22,
              padding: '10px 18px',
              fontWeight: 700,
              border: 'none',
              width: 200,
              margin: '8px auto 0',
            }}
            className="hover:bg-[#0d47a1]"
          >
            Cadastrar
          </button>
        </form>
      </div>
    </div>
  );
}
