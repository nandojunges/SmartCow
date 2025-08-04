require('dotenv').config();
const { sequelize } = require('./config/db');
const Usuario = require('./models/Usuario');
const { hashSenha } = require('./utils/hashSenha');

const seed = async () => {
  try {
    await sequelize.sync({ force: true });
    const adminSenha = await hashSenha('admin123');
    const produtorSenha = await hashSenha('produtor123');

    await Usuario.bulkCreate([
      {
        nome: 'Admin',
        email: 'admin@smartcode.com',
        senha: adminSenha,
        tipo: 'admin',
      },
      {
        nome: 'Produtor',
        email: 'produtor@smartcode.com',
        senha: produtorSenha,
        tipo: 'produtor',
      },
    ]);
    console.log('Seed concluído');
  } catch (err) {
    console.error('Erro no seed', err);
  } finally {
    await sequelize.close();
  }
};

seed();
