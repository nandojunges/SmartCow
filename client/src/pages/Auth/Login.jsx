// src/pages/Auth/Login.jsx
import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import api from '../../api';
import CarrosselLogos from '../../components/CarrosselLogos';

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

  const inputStyle = {
    width: '100%',
    padding: '12px',
    fontSize: '1rem',
    borderRadius: '10px',
    border: '1px solid #ccc',
  };

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
         backgroundImage: "url('icones/telafundo.png')",
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
         SmartMilk – GESTÃO LEITEIRA
        </h1>
        <h2
          style={{
            fontFamily: "'Pacifico', cursive",
            fontSize: '22px',
            color: '#ffbb33',
            textShadow: '1px 1px 2px rgba(0,0,0,0.4)',
            marginTop: '10px',
            marginBottom: 0,
          }}
        >
          Feito por quem vive no campo.
        </h2>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: '60px',
          marginTop: '120px',
          padding: '0 40px',
          width: '100%',
        }}
      >
        <motion.div
          style={{ display: 'flex', justifyContent: 'center' }}
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        >
          <CarrosselLogos />
        </motion.div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
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
                width: '420px',
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

              <h2
                style={{
                  textAlign: 'center',
                  fontWeight: 700,
                  color: '#1e3a8a',
                  marginBottom: '20px',
                }}
              >
                Login
              </h2>

              <form
                onSubmit={handleSubmit}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '16px' }}
              >
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', alignSelf: 'flex-start' }}>Email</label>
                  <div style={{ position: 'relative', width: '100%', maxWidth: '360px' }}>
                    <input
                      type="email"
                      placeholder="Digite seu e-mail"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  {erroEmail && <p style={{ color: 'red', fontSize: '0.875rem', marginTop: '4px' }}>{erroEmail}</p>}
                </div>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', alignSelf: 'flex-start' }}>Senha</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '100%', maxWidth: '360px' }}>
                    <input
                      type={mostrarSenha ? 'text' : 'password'}
                      placeholder="Digite sua senha"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      style={{ ...inputStyle, paddingRight: '40px' }}
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
                  {erroSenha && <p style={{ color: 'red', fontSize: '0.875rem', marginTop: '4px' }}>{erroSenha}</p>}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    width: '100%',
                    maxWidth: '360px',
                    alignSelf: 'flex-start',
                  }}
                >
                  <input
                    id="lembrar"
                    type="checkbox"
                    checked={lembrar}
                    onChange={(e) => setLembrar(e.target.checked)}
                  />
                  <label htmlFor="lembrar" style={{ fontSize: '0.9rem' }}>
                    Lembrar-me
                  </label>
                </div>

                <button
                  type="submit"
                  style={{
                    width: '100%',
                    maxWidth: '360px',
                    height: '42px',
                    background: 'linear-gradient(90deg, #1e3a8a, #3b82f6)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '25px',
                    fontSize: '1rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'background 0.3s ease',
                    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
                  }}
                  onMouseOver={(e) => (e.target.style.background = 'linear-gradient(90deg, #1e40af, #1e3a8a)')}
                  onMouseOut={(e) =>
                    (e.target.style.background = 'linear-gradient(90deg, #1e3a8a, #3b82f6)')
                  }
                >
                  Entrar
                </button>
                <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.85rem' }}>
                  <Link to="/esqueci-senha" style={{ textDecoration: 'underline', color: '#1e3a8a' }}>
                    Esqueceu a senha?
                  </Link>
                  <br />
                  <Link to="/escolher-plano" style={{ textDecoration: 'underline', color: '#1e3a8a' }}>
                    Cadastrar-se
                  </Link>
                </p>
              </form>
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
