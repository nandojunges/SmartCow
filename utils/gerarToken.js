const jwt = require('jsonwebtoken');

const gerarToken = (payload, expiresIn = '1h') => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

module.exports = gerarToken;
