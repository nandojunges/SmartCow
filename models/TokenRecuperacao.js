const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Usuario = require('./Usuario');

const TokenRecuperacao = sequelize.define('TokenRecuperacao', {
  token: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  validade: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.ENUM('verificacao', 'recuperacao'),
    allowNull: false,
  },
});

Usuario.hasMany(TokenRecuperacao, { foreignKey: 'userId' });
TokenRecuperacao.belongsTo(Usuario, { foreignKey: 'userId' });

module.exports = TokenRecuperacao;
