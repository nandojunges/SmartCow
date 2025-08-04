const Animal = require('../models/Animal');

exports.list = async (req, res) => {
  const animais = await Animal.findAll();
  return res.json(animais);
};

exports.get = async (req, res) => {
  const animal = await Animal.findByPk(req.params.id);
  if (!animal) {
    return res.status(404).json({ message: 'Animal não encontrado' });
  }
  return res.json(animal);
};

exports.create = async (req, res) => {
  try {
    const animal = await Animal.create(req.body);
    return res.status(201).json(animal);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao criar animal' });
  }
};

exports.update = async (req, res) => {
  const animal = await Animal.findByPk(req.params.id);
  if (!animal) {
    return res.status(404).json({ message: 'Animal não encontrado' });
  }
  try {
    await animal.update(req.body);
    return res.json(animal);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar animal' });
  }
};

exports.remove = async (req, res) => {
  const animal = await Animal.findByPk(req.params.id);
  if (!animal) {
    return res.status(404).json({ message: 'Animal não encontrado' });
  }
  try {
    await animal.destroy();
    return res.json({ message: 'Animal removido' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao remover animal' });
  }
};
