const validarEmail = (email) => /\S+@\S+\.\S+/.test(email);

module.exports = validarEmail;
