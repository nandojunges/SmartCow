// src/pages/Auth/Login.jsx
import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { apiAuth } from '../../api'; // usa cliente de AUTH (/api)
import LoginInfoRotativo from './LoginInfoRotativo';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erroEmail, setErroEmail] = useState('');
  const [erroSenha, setErroSenha] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const salvo = localStorage.getItem('rememberEmail');
    if (salvo) {
      setEmail(salvo);
      setLembrar(true);
    }
  }, []);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validar = () => {
    const emailTrim = email.trim();
    const senhaTrim = senha.trim();
    let ok = true;

    if (!emailRegex.test(emailTrim)) {
      setErroEmail('Email inválido');
      ok = false;
    } else {
      setErroEmail('');
    }
    if (!senhaTrim) {
      setErroSenha('Senha obrigatória');
      ok = false;
    } else {
      setErroSenha('');
    }
    return ok;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validar()) return;

    try {
      setCarregando(true);

      const { data, status } = await apiAuth.post('/auth/login', {
        email: email.trim().toLowerCase(),
        senha: senha.trim(),
      });

      if (status === 200 && data?.token) {
        const token = data.token;
        const user = data.user;

        let decoded = null;
        try { decoded = jwtDecode(token); } catch {}

        const isAdmin =
          user?.perfil === 'admin' ||
          decoded?.perfil === 'admin' ||
          false;

        localStorage.setItem('token', token);
        if (user) localStorage.setItem('user', JSON.stringify(user));

        if (lembrar) {
          localStorage.setItem('rememberEmail', email.trim().toLowerCase());
        } else {
          localStorage.removeItem('rememberEmail');
        }

        navigate(isAdmin ? '/admin' : '/inicio', { replace: true });
      } else {
        alert('Token não recebido.');
      }
    } catch (err) {
      localStorage.removeItem('token');
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Email ou senha incorretos.';
      alert(msg);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        overflow: 'hidden',
        backgroundImage: "url('/icones/telafundo.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', 'Poppins', sans-serif",
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center',
          color: '#fff',
          textShadow: '0 1px 4px rgba(0,0,0,0.5)',
          zIndex: 5,
        }}
      >
        <h1
          style={{
            fontFamily: "'Poppins', sans-serif",
            fontSize: '3rem',
            fontWeight: 700,
            margin: 0,
            marginBottom: '5px',
          }}
        >
          SmartMilk - GESTÃO LEITEIRA
        </h1>
        <h2
          style={{
            fontFamily: "'Dancing Script', cursive",
            fontSize: '2rem',
            fontWeight: 500,
            color: '#ffd43b',
            textShadow: '1px 1px 3px rgba(0,0,0,0.4)',
            margin: 0,
          }}
        >
          Feito por quem vive no campo.
        </h2>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          flex: 1,
          marginTop: '120px',
        }}
      >
        <motion.div
          style={{ flex: 1 }}
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        >
          <LoginInfoRotativo />
        </motion.div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                padding: '40px',
                borderRadius: '20px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                maxWidth: '500px',
                width: '100%',
              }}
            >
              <p
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  fontFamily: "'Poppins', sans-serif",
                  marginBottom: '10px',
                  textAlign: 'center',
                }}
              >
                Bem-vindo ao SmartMilk!
              </p>
              <h2 className="text-xl font-bold text-center mb-4" style={{ color: '#1e3a8a' }}>Login</h2>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <div className="input-senha-container">
                    <input
                      type="email"
                      placeholder="Digite seu e-mail"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-senha"
                    />
                  </div>
                  {erroEmail && <p className="text-red-600 text-sm mt-1">{erroEmail}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                  <div className="input-senha-container">
                    <input
                      type={mostrarSenha ? 'text' : 'password'}
                      placeholder="Digite sua senha"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      className="input-senha input-senha-olho"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      className="botao-olho"
                    >
                      {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {erroSenha && <p className="text-red-600 text-sm mt-1">{erroSenha}</p>}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="lembrar"
                    type="checkbox"
                    checked={lembrar}
                    onChange={(e) => setLembrar(e.target.checked)}
                  />
                  <label htmlFor="lembrar" className="text-sm">Lembrar-me</label>
                </div>

                <button
                  type="submit"
                  style={{
                    background: 'linear-gradient(90deg, #1e3a8a, #3b82f6)',
                    color: '#fff',
                    padding: '12px 24px',
                    borderRadius: '30px',
                    border: 'none',
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#1e40af')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'linear-gradient(90deg, #1e3a8a, #3b82f6)')}
                  disabled={carregando}
                >
                  {carregando ? 'Entrando…' : 'Entrar'}
                </button>

                <div className="text-right">
                  <Link to="/esqueci-senha" className="text-sm text-blue-600 hover:underline">
                    Esqueceu a senha?
                  </Link>
                </div>
              </form>

              <p className="text-center text-sm text-gray-600 mt-4 font-light">
                Não tem conta?{' '}
                <Link to="/escolher-plano" className="text-blue-600 hover:underline">
                  Cadastrar-se
                </Link>
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      <footer
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.6)',
          padding: '8px',
          textAlign: 'center',
          fontSize: '0.8rem',
          width: '100%',
        }}
      >
        Versão 1.0.0 | © Gestão Leiteira 2025
      </footer>
    </div>
  );
}
