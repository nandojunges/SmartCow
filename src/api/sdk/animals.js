// src/api/sdk/animals.js
import api from '../../api'; // usa seu axios já configurado

// opts: { q, page, limit, sort, order, from, to }
export const listAnimals = (opts = {}) =>
  api.get('/api/v1/animals', { params: opts }).then(r => r.data); // {items,page,limit,total,pages,...}
export const getAnimal      = (id) => api.get(`/api/v1/animals/${id}`).then(r => r.data);
export const createAnimal   = (payload) => api.post('/api/v1/animals', payload).then(r => r.data);
export const updateAnimal   = (id, payload) => api.put(`/api/v1/animals/${id}`, payload).then(r => r.data);
export const deleteAnimal   = (id) => api.delete(`/api/v1/animals/${id}`).then(r => r.data);

export const getAnimalsMetrics = (days = 30) =>
  api.get('/api/v1/animals/metrics', { params: { days } }).then(r => r.data);
