import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api';

export default function VerificarEmail() {
  const [searchParams] = useSearchParams();
  const emailParam = searchParams.get('email') || '';
  const [email, setEmail] = useState(emailParam);
  const [codigo, setCodigo] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/verificar', { email, codigo });
      navigate('/');
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
        <h2 className="text-xl font-bold text-center mb-4">Verificar Email</h2>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          className="w-full px-4 py-2 border rounded-lg mb-4"
        />
        <input
          type="text"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Código de verificação"
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

