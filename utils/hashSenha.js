const bcrypt = require('bcrypt');

const hashSenha = async (senha) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(senha, salt);
};

const compararSenha = (senha, hash) => bcrypt.compare(senha, hash);

module.exports = { hashSenha, compararSenha };
