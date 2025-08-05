async function criar(db, usuario) {
  const query = `
    INSERT INTO usuarios (nome, email, nomeFazenda, telefone, senha, plano, formaPagamento)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const valores = [
    usuario.nome,
    usuario.email,
    usuario.nomeFazenda,
    usuario.telefone,
    usuario.senha,
    usuario.plano,
    usuario.formaPagamento,
  ];

  await db.run(query, valores);
}

module.exports = { criar };
