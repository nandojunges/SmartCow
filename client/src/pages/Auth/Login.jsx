import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { jwtDecode } from 'jwt-decode';
import api from '../../api';
import CarrosselLogos from '../../components/CarrosselLogos';

function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [errors, setErrors] = useState({});
  const [hover, setHover] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const salvo = localStorage.getItem('rememberedEmail');
    if (salvo) {
      setEmail(salvo);
      setLembrar(true);
    }
  }, []);

  const validar = () => {
    const e = {};
    if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Email inválido';
    if (!senha) e.senha = 'Senha obrigatória';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validar()) return;
    try {
      const { data } = await api.post('/auth/login', { email, senha });
      localStorage.setItem('token', data.token);
      if (lembrar) localStorage.setItem('rememberedEmail', email);
      else localStorage.removeItem('rememberedEmail');
      const user = jwtDecode(data.token);
      navigate(user?.perfil === 'admin' ? '/admin' : '/inicio');
    } catch {
      alert('Credenciais inválidas');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        backgroundImage: "url('/telafundo.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        fontFamily: "'Poppins', sans-serif",
        position: 'relative',
      }}
    >
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          color: '#fff',
          padding: '20px',
        }}
      >
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '10px' }}>
          Bem-vindo ao Gestão Leiteira
        </h1>
        <p style={{ fontSize: '1.2rem', maxWidth: '420px', marginBottom: '20px' }}>
          Plataforma completa para facilitar a gestão da sua produção de leite.
        </p>
        <CarrosselLogos />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            backgroundColor: 'rgba(255,255,255,0.8)',
            borderRadius: '12px',
            padding: '40px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            width: '100%',
            maxWidth: '420px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '10px' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>
              Bem-vindo ao SmartMilk!
            </h1>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 500 }}>Login</h2>
          </div>
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #ccc',
              }}
            />
            {errors.email && (
              <p style={{ color: 'red', fontSize: '12px' }}>{errors.email}</p>
            )}
          </div>
          <div>
            <div style={{ position: 'relative' }}>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Senha"
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 10px',
                  borderRadius: '8px',
                  border: '1px solid #ccc',
                }}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((s) => !s)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.senha && (
              <p style={{ color: 'red', fontSize: '12px' }}>{errors.senha}</p>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '14px',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="checkbox"
                checked={lembrar}
                onChange={(e) => setLembrar(e.target.checked)}
              />
              Lembrar-me
            </label>
            <Link to="/recuperar">Esqueceu a senha?</Link>
          </div>
          <button
            type="submit"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              background: hover
                ? 'linear-gradient(90deg, #1e3a8a, #2563eb)'
                : 'linear-gradient(90deg, #1e3a8a, #3b82f6)',
              color: '#fff',
              padding: '10px',
              border: 'none',
              borderRadius: '30px',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'background 0.3s',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}
          >
            Entrar
          </button>
          <p style={{ textAlign: 'center', fontSize: '14px' }}>
            Não tem conta? <Link to="/escolher-plano">Cadastre-se</Link>
          </p>
        </form>
      </motion.div>
      <footer
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          width: '100%',
          textAlign: 'center',
          padding: '16px 0',
          backgroundColor: 'rgba(255,255,255,0.7)',
          fontSize: '14px',
        }}
      >
        Versão 1.0.0 | © Gestão Leiteira 2025
      </footer>
    </div>
  );
}

export default Login;
