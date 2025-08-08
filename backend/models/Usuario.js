async function criar(db, usuario) {
  const sql = `
    INSERT INTO usuarios (nome, email, nomeFazenda, telefone, senha, plano, formaPagamento)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const vals = [
    usuario.nome,
    usuario.email,
    usuario.nomeFazenda ?? null,
    usuario.telefone ?? null,
    usuario.senha,
    usuario.plano ?? null,
    usuario.formaPagamento ?? null,
  ];
  await db.run(sql, vals);
}

module.exports = { criar };
