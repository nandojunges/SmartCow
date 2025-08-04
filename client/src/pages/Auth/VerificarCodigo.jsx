import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

export default function VerificarCodigo() {
  const [codigo, setCodigo] = useState('');
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  useEffect(() => {
    const emailSalvo = localStorage.getItem('emailCadastro');
    if (!emailSalvo) {
      navigate('/cadastro');
    } else {
      setEmail(emailSalvo);
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/verificar', { email, codigo });

      // Limpa dados salvos temporariamente
      localStorage.removeItem('emailCadastro');
      localStorage.removeItem('dadosCadastro');

      navigate('/login');
    } catch (err) {
      alert('Código inválido ou expirado');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col items-center justify-center min-h-screen bg-gray-50"
    >
      <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md">
        <img src="/icon.svg" alt="Logo" className="mx-auto mb-4 w-16" />
        <h2 className="text-xl font-bold text-center mb-4">
          Verificar Código
        </h2>
        <p className="text-center text-gray-600 text-sm mb-4">
          Um código foi enviado para: <strong>{email}</strong>
        </p>
        <input
          type="text"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Digite o código"
          className="w-full px-4 py-2 border rounded-lg mb-4"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 w-full"
        >
          Verificar e Finalizar
        </button>
      </div>
    </form>
  );
}

