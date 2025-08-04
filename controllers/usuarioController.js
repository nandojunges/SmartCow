const Usuario = require('../models/Usuario');

exports.me = async (req, res) => {
  try {
    const usuario = await Usuario.findByPk(req.userId, {
      attributes: ['id', 'nome', 'email', 'tipo'],
    });
    if (!usuario) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    return res.json(usuario);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
};
