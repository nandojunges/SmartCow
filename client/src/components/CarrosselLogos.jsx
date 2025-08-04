import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
export default function CarrosselLogos() {
   
  const [infos, setInfos] = useState ([]);
  const [índice, setIndice] = useState ( 0 );
  const [ visivel, setVisivel] = useState ( verdadeiro);
  useEffect(() => {
  async function carregarArquivos() {
      const arquivos = ['01.txt', '02.txt', '03.txt'];
      const promessas = arquivos.map(async (nome) => {
        const resp = await fetch(`/data/rotativos/${nome}`);
        const texto = await resp.text();
        const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const obj = {};
        linhas.forEach(linha => {
          const [chave, ...resto] = linha.split(':');
          obj[chave.trim()] = resto.join(':').trim();
        });
        obj.mostrarImagem = obj.mostrarImagem === 'true';
        obj.tempo = parseInt(obj.tempo, 10) || 5;
        return obj;
      });
      const lista = await Promise.all(promessas);
      setInfos(lista);
    }
    carregarArquivos();
  }, []);

  useEffect(() => {
    if (!infos.length) return;
    const tempoVisivel = (infos[indice]?.tempo || 5) * 1000;
    const timeout = setTimeout(() => {
      setVisivel(false);
      setTimeout(() => {
        setIndice((i) => (i + 1) % infos.length);
        setVisivel(true);
      }, 500);
    }, tempoVisivel);
    return () => clearTimeout(timeout);
  }, [indice, infos]);

  const item = infos[indice] || {};
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
     <AnimatePresence mode="wait">
        {visivel && (
          <motion.div
            key={indice}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 1.0, ease: 'easeOut' }}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.7)',
              padding: '30px',
              borderRadius: '15px',
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)',
              maxWidth: '500px',
              textAlign: 'center',
              fontFamily: "'Inter', 'Poppins', sans-serif",
            }}
          >
            {item.titulo && (
              <h2
                style={{
                  fontSize: '1.8rem',
                  fontWeight: 700,
                  color: '#1e293b',
                  marginBottom: '12px',
                }}
              >
                {item.titulo}
              </h2>
            )}
            {item.mensagem && (
              <p
                style={{
                  fontSize: '1rem',
                  fontWeight: 400,
                  color: '#334155',
                  lineHeight: '1.5',
                  marginBottom: item.mostrarImagem ? '15px' : 0,
                }}
              >
                {item.mensagem}
              </p>
            )}
            {item.mostrarImagem && item.imagem && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
                {item.imagem.split(',').map((img, i) => (
                  <img
                    key={i}
                    src={`/${img.trim()}`}
                    alt=""
                    className="rounded-lg shadow"
                    style={{ maxWidth: '200px', marginTop: '10px' }}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
