const codigosVerificacao = {};
const emailsVerificados = {};

function gerarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function salvarCodigo(email, codigo) {
  codigosVerificacao[email] = {
    codigo,
    expiraEm: Date.now() + 10 * 60 * 1000 // 10 minutos
  };
}

function verificarCodigo(email, codigoInformado) {
  const registro = codigosVerificacao[email];
  if (!registro) return { valido: false, motivo: 'Código não encontrado' };
  if (Date.now() > registro.expiraEm) {
    delete codigosVerificacao[email];
    return { valido: false, motivo: 'Código expirado' };
  }
  if (registro.codigo !== codigoInformado) return { valido: false, motivo: 'Código incorreto' };

  emailsVerificados[email] = true;
  delete codigosVerificacao[email];
  return { valido: true };
}

function emailFoiVerificado(email) {
  return emailsVerificados[email] === true;
}

module.exports = {
  gerarCodigo,
  salvarCodigo,
  verificarCodigo,
  emailFoiVerificado
};
