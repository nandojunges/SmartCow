const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Animal = sequelize.define('Animal', {
  nome: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  nascimento: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  categoria: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  raca: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

module.exports = Animal;
