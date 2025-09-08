import jwt from 'jsonwebtoken';

export default function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Token ausente' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    req.user = decoded;

    if (!req.usuario.idProdutor) {
      console.log('❌ idProdutor ausente no token');
      return res.status(403).json({ erro: 'Permissão negada: produtor não identificado' });
    }

    next();
  } catch (e) {
    console.error('❌ Erro ao verificar token:', e.message);
    return res.status(403).json({ erro: 'Token inválido' });
  }
};

