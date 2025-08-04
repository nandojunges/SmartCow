import { useEffect, useState } from 'react';

const frases = [
  'Melhore sua gestão.',
  'Economize tempo.',
  'Acompanhe seus animais com precisão.',
  'Automatize tarefas do dia a dia.',
  'Tome decisões baseadas em dados reais.',
];

export default function FrasesRotativas() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const intervalo = setInterval(() => {
      setIndex((prev) => (prev + 1) % frases.length);
    }, 3000);
    return () => clearInterval(intervalo);
  }, []);

  return (
    <div
      style={{
        fontSize: '16px',
        fontWeight: '500',
        color: '#1565c0',
        textAlign: 'center',
        marginBottom: '16px',
        minHeight: '24px',
        transition: 'opacity 0.5s ease-in-out',
      }}
    >
      {frases[index]}
    </div>
  );
}

