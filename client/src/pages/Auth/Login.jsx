// src/pages/Auth/Login.jsx
import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import api from '../../api';

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
    setEmail(emailTrim);
    setSenha(senhaTrim);
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
      const res = await api.post('/auth/login', {
        email: email.trim(),
        senha: senha.trim(),
      });

      if (res.status === 200 && res.data?.token) {
        const token = res.data.token;
        localStorage.setItem('token', token);
        if (lembrar) {
          localStorage.setItem('rememberEmail', email.trim());
        } else {
          localStorage.removeItem('rememberEmail');
        }
        const decoded = jwtDecode(token);
        const isAdmin = decoded?.perfil === 'admin';
        navigate(isAdmin ? '/admin' : '/inicio');
      } else {
        alert('Token não recebido.');
      }
    } catch (err) {
      alert(
        err.response?.data?.erro ||
          err.response?.data?.message ||
          'Email ou senha incorretos.'
      );
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
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        >
          <div
            style={{
              backgroundColor: 'rgba(255,255,255,0.85)',
              padding: '40px',
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              width: '100%',
              maxWidth: '350px',
            }}
          >
            <p
              style={{
                fontSize: '1.5rem',
                fontWeight: 600,
                fontFamily: "'Poppins', sans-serif",
                marginBottom: '8px',
                textAlign: 'center',
              }}
            >
              Bem-vindo ao SmartMilk!
            </p>

            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#1e3a8a',
                textAlign: 'center',
                marginBottom: '20px',
              }}
            >
              Login
            </h2>

            <form
              onSubmit={handleSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                maxWidth: '350px',
              }}
            >
              <div style={{ width: '100%' }}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  className="input-login"
                  placeholder="Digite seu e-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {erroEmail && (
                  <p className="text-red-600 text-sm mt-1">{erroEmail}</p>
                )}
              </div>

              <div style={{ width: '100%' }}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    className="input-login"
                    placeholder="Digite sua senha"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    style={{ paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha(!mostrarSenha)}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      right: '12px',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {erroSenha && (
                  <p className="text-red-600 text-sm mt-1">{erroSenha}</p>
                )}
              </div>

              <div
                style={{
                  alignSelf: 'flex-start',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <input
                  id="lembrar"
                  type="checkbox"
                  checked={lembrar}
                  onChange={(e) => setLembrar(e.target.checked)}
                />
                <label htmlFor="lembrar" className="text-sm">
                  Lembrar-me
                </label>
              </div>

              <button
                type="submit"
                style={{
                  background: 'linear-gradient(90deg, #1e3a8a, #3b82f6)',
                  color: '#fff',
                  fontWeight: '700',
                  borderRadius: '20px',
                  border: 'none',
                  height: '45px',
                  width: '100%',
                  cursor: 'pointer',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                }}
              >
                Entrar
              </button>

              <div style={{ textAlign: 'center', marginTop: '4px' }}>
                <Link
                  to="/esqueci-senha"
                  style={{
                    color: '#6f42c1',
                    fontSize: '0.875rem',
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  Esqueceu a senha?
                </Link>
                <Link
                  to="/escolher-plano"
                  style={{
                    color: '#6f42c1',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                  }}
                >
                  Cadastrar-se
                </Link>
              </div>
            </form>
          </div>
        </motion.div>
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
