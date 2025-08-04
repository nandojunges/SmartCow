const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Usuario = sequelize.define('Usuario', {
  nome: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  senha: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.ENUM('admin', 'produtor'),
    defaultValue: 'produtor',
  },
  status: {
    type: DataTypes.ENUM('pendente', 'verificado'),
    defaultValue: 'pendente',
  },
});

module.exports = Usuario;
