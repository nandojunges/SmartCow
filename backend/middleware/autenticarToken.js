import jwt from 'jsonwebtoken';
import { initDB } from '../db.js';
const SECRET = process.env.JWT_SECRET || 'segredo';

function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    console.log('Token recebido:', token.slice(0, 30) + '...');
  }

  if (!token) {
    return res.status(401).json({ message: 'Token não fornecido' });
  }

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      console.error('Falha ao verificar token:', err.message);
      return res.status(403).json({ message: 'Token inválido' });
    }

    const db = initDB(decoded.email);
    const usuario = db
      .prepare(
        'SELECT status, dataLiberado, dataFimLiberacao, dataFimTeste, tipoConta FROM usuarios WHERE id = ?'
      )
      .get(decoded.idProdutor);

    if (!usuario) {
      return res.status(401).json({ message: 'Usuário não encontrado' });
    }

    if (!decoded || !decoded.idProdutor) {
      return res.status(403).json({
        message: 'Usuário sem permissão ou produtor não identificado',
      });
    }

    const isAdmin = usuario.tipoConta === 'admin';

    if (
      !isAdmin &&
      usuario.dataFimLiberacao &&
      new Date(usuario.dataFimLiberacao) < new Date()
    ) {
      db.prepare('UPDATE usuarios SET status = ? WHERE id = ?').run(
        'bloqueado',
        decoded.idProdutor
      );
      usuario.status = 'bloqueado';
    }

    if (
      !isAdmin &&
      usuario.status === 'teste' &&
      usuario.dataFimTeste &&
      new Date(usuario.dataFimTeste) < new Date()
    ) {
      db.prepare('UPDATE usuarios SET status = ? WHERE id = ?').run(
        'suspenso',
        decoded.idProdutor
      );
      usuario.status = 'suspenso';
    }

    if (!isAdmin && usuario.status === 'bloqueado') {
      return res.status(403).json({ message: 'Usuário bloqueado' });
    }

    if (!isAdmin && usuario.status === 'suspenso') {
      return res.status(403).json({
        message: 'Sua conta está suspensa. Selecione um plano para continuar.'
      });
    }

    console.log('Token decodificado:', decoded);
    req.user = decoded;

    next();
  });
}

export default autenticarToken;
