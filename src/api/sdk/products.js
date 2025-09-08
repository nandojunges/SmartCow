// src/api/sdk/products.js
import api from '../../api';

export const listProducts = (opts = {}) =>
  api.get('/api/v1/products', { params: opts }).then(r => r.data);
export const getProduct     = (id) => api.get(`/api/v1/products/${id}`).then(r => r.data);
export const createProduct  = (payload) => api.post('/api/v1/products', payload).then(r => r.data);
export const updateProduct  = (id, payload) => api.put(`/api/v1/products/${id}`, payload).then(r => r.data);
export const deleteProduct  = (id) => api.delete(`/api/v1/products/${id}`).then(r => r.data);

export const getProductsMetrics = (days = 15) =>
  api.get('/api/v1/products/metrics', { params: { days } }).then(r => r.data);
