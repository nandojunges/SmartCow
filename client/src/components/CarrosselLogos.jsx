import { useState, useEffect } from 'react';

const logos = ['/logo1.png', '/logo2.png', '/logo3.png', '/logo4.png'];

function CarrosselLogos() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % logos.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        width: '200px',
        height: '100px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <img
        src={logos[index]}
        alt={`logo-${index}`}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
      />
    </div>
  );
}

export default CarrosselLogos;
