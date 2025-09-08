// src/api.js
import axios from 'axios';

/* ========= Clientes ========= */
export const apiV1 = axios.create({
  baseURL: '/api/v1',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

export const apiAuth = axios.create({
  baseURL: '/api',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

/* ========= Helpers ========= */
const injectToken = (config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
};

// remove prefixo duplicado: base '/api' + url '/api/auth/login' => '/auth/login'
const stripDup = (config, expectedBase) => {
  let url = config.url || '';
  if (!url.startsWith('/')) url = `/${url}`;
  if (expectedBase === '/api' && url.startsWith('/api/')) url = url.slice(4);
  if (expectedBase === '/api/v1' && url.startsWith('/api/v1/')) url = url.slice(7);
  config.url = url;
  return config;
};

/* ========= Interceptores ========= */
apiAuth.interceptors.request.use((cfg) => stripDup(injectToken(cfg), '/api'));
apiV1.interceptors.request.use((cfg) => stripDup(injectToken(cfg), '/api/v1'));

const onRespErr = (err) => {
  const status = err?.response?.status;
  if (status === 401 || status === 403) localStorage.removeItem('token');
  return Promise.reject(err);
};
apiAuth.interceptors.response.use((r) => r, onRespErr);
apiV1.interceptors.response.use((r) => r, onRespErr);

/* ========= AUTH ========= */
export async function authLogin(email, senha) {
  const { data } = await apiAuth.post('/auth/login', {
    email: String(email).trim().toLowerCase(),
    senha: String(senha).trim(),
  });
  return data; // { token, user }
}

export async function authRegister(email, senha) {
  const { data } = await apiAuth.post('/auth/register', {
    email: String(email).trim().toLowerCase(),
    senha: String(senha).trim(),
  });
  return data;
}
export async function authResend(email) {
  const { data } = await apiAuth.post('/auth/resend', {
    email: String(email).trim().toLowerCase(),
  });
  return data;
}
export async function authVerify(email, code) {
  const { data } = await apiAuth.post('/auth/verify', {
    email: String(email).trim().toLowerCase(),
    code: String(code).trim(),
  });
  return data;
}

// Fluxo “esqueci a senha”
export async function authForgotPassword(email) {
  const { data } = await apiAuth.post('/auth/forgot-password', {
    email: String(email).trim().toLowerCase(),
  });
  return data;
}
export async function authResetPassword(email, code, novaSenha) {
  const { data } = await apiAuth.post('/auth/reset-password', {
    email: String(email).trim().toLowerCase(),
    code: String(code).trim(),
    novaSenha: String(novaSenha).trim(),
  });
  return data;
}

/* ========= ANIMAIS (/api/v1/animals) ========= */
export async function getAnimais({ estado, q, page, limit } = {}) {
  const params = {};
  if (estado) params.estado = estado;
  if (q) params.q = q;
  if (page) params.page = page;
  if (limit) params.limit = limit;
  const { data } = await apiV1.get('/animals', { params });
  return data;
}

export async function getAnimal(id) {
  const { data } = await apiV1.get(`/animals/${id}`);
  return data;
}

export async function criarAnimal(body) {
  const { data } = await apiV1.post('/animals', body);
  return data;
}

export async function atualizarAnimal(id, body) {
  const { data } = await apiV1.put(`/animals/${id}`, body);
  return data;
}

export async function removerAnimal(id) {
  const { data } = await apiV1.delete(`/animals/${id}`);
  return data;
}

/* ----- LOTE do animal (endpoint dedicado) ----- */
/** Atualiza somente o lote do animal usando o endpoint /animals/:id/lote. */
export async function atualizarAnimalLote(id, payload = {}) {
  // normaliza campos aceitando diferentes nomes vindos do front
  const body = {};
  if (payload.lote_id !== undefined) body.lote_id = payload.lote_id;
  if (payload.lote_nome !== undefined) body.lote_nome = payload.lote_nome;

  if (payload.loteId !== undefined) body.lote_id = payload.loteId;
  if (payload.loteNome !== undefined) body.lote_nome = payload.loteNome;

  if (payload.current_lote_id !== undefined) body.lote_id = payload.current_lote_id;
  if (payload.current_lote_nome !== undefined) body.lote_nome = payload.current_lote_nome;

  const { data } = await apiV1.put(`/animals/${id}/lote`, body);
  return data; // devolve o animal com current_lote_id/nome normalizados
}

/** Lê o lote atual do animal: { lote_id, lote_nome, source } */
export async function getAnimalLote(id) {
  const { data } = await apiV1.get(`/animals/${id}/lote`);
  return data;
}

/* ========= CALENDÁRIO (/api/v1/calendar/...) ========= */
/** Lista eventos manuais persistidos (tabela calendar_events) no intervalo informado */
export async function getCalendarManualEvents({ start, end }) {
  const params = {};
  if (start) params.start = String(start).slice(0, 10);
  if (end) params.end = String(end).slice(0, 10);
  const { data } = await apiV1.get('/calendar/events', { params });
  return data; // [{ id, title, tipo, start, end, allDay, prioridadeVisual, notes }]
}

/** Lista eventos automáticos agregados de outras tabelas (seu backend monta) */
export async function getCalendarAutoEvents({ start, end }) {
  const params = {};
  if (start) params.start = String(start).slice(0, 10);
  if (end) params.end = String(end).slice(0, 10);
  const { data } = await apiV1.get('/calendar/auto-events', { params });
  return data;
}

/** Cria um evento manual */
export async function createCalendarEvent(payload) {
  const { data } = await apiV1.post('/calendar/events', payload);
  return data;
}

/** Atualiza um evento manual (envie apenas os campos que mudarão) */
export async function updateCalendarEvent(id, patch) {
  const { data } = await apiV1.put(`/calendar/events/${id}`, patch);
  return data;
}

/** Remove um evento manual */
export async function deleteCalendarEvent(id) {
  const { data } = await apiV1.delete(`/calendar/events/${id}`);
  return data;
}

/* ========= CONSUMO & REPOSIÇÃO (/api/v1/consumo/...) ========= */
/* ----- ESTOQUE ----- */
export async function getEstoque({ categoria, q } = {}) {
  const params = {};
  if (categoria) params.categoria = categoria;
  if (q) params.q = q;
  const { data } = await apiV1.get('/consumo/estoque', { params });
  return Array.isArray(data?.items) ? data.items : [];
}
export async function createProdutoEstoque(payload) {
  const { data } = await apiV1.post('/consumo/estoque', payload);
  return data;
}
export async function updateProdutoEstoque(id, patch) {
  const { data } = await apiV1.put(`/consumo/estoque/${id}`, patch);
  return data;
}
export async function deleteProdutoEstoque(id) {
  const { data } = await apiV1.delete(`/consumo/estoque/${id}`);
  return data;
}

/* ----- LOTES ----- */
export async function getConsumoLotes() {
  const { data } = await apiV1.get('/consumo/lotes');
  return Array.isArray(data?.items) ? data.items : [];
}
export async function createConsumoLote(payload) {
  const { data } = await apiV1.post('/consumo/lotes', payload);
  return data;
}
export async function updateConsumoLote(id, patch) {
  const { data } = await apiV1.put(`/consumo/lotes/${id}`, patch);
  return data;
}
export async function deleteConsumoLote(id) {
  const { data } = await apiV1.delete(`/consumo/lotes/${id}`);
  return data;
}
/** Lista animais (com dados) vinculados a um lote (quando o backend conseguir enriquecer) */
export async function getAnimaisDoLote(loteId) {
  const { data } = await apiV1.get(`/consumo/lotes/${loteId}/animais`);
  return Array.isArray(data?.items) ? data.items : [];
}

/* ----- LOTAÇÃO (animal <-> lote) ----- */
export async function getLotacaoMap() {
  const { data } = await apiV1.get('/consumo/lotacao');
  return data?.map || {};
}
export async function getLotacaoAnimal(animalId) {
  const { data } = await apiV1.get(`/consumo/lotacao/${animalId}`);
  return data || null;
}
/** Define/atualiza o lote do animal. Passe `null` para desvincular. */
export async function setLotacaoAnimal(animalId, loteId) {
  const { data } = await apiV1.put(`/consumo/lotacao/${animalId}`, { loteId });
  return data; // { loteId, loteNome, updatedAt } | null
}

/* ----- DIETAS ----- */
export async function getDietas() {
  const { data } = await apiV1.get('/consumo/dietas');
  return Array.isArray(data?.items) ? data.items : [];
}
export async function createDieta(payload) {
  const { data } = await apiV1.post('/consumo/dietas', payload);
  return data;
}
export async function updateDieta(id, patch) {
  const { data } = await apiV1.put(`/consumo/dietas/${id}`, patch);
  return data;
}
export async function deleteDieta(id) {
  const { data } = await apiV1.delete(`/consumo/dietas/${id}`);
  return data;
}

/* ----- LIMPEZA (Ciclos) ----- */
export async function getCiclosLimpeza() {
  const { data } = await apiV1.get('/consumo/limpeza/ciclos');
  return Array.isArray(data?.items) ? data.items : [];
}
export async function createCicloLimpeza(payload) {
  const { data } = await apiV1.post('/consumo/limpeza/ciclos', payload);
  return data;
}
export async function updateCicloLimpeza(id, patch) {
  const { data } = await apiV1.put(`/consumo/limpeza/ciclos/${id}`, patch);
  return data;
}
export async function deleteCicloLimpeza(id) {
  const { data } = await apiV1.delete(`/consumo/limpeza/ciclos/${id}`);
  return data;
}
export async function getPlanoLimpeza(id) {
  const { data } = await apiV1.get(`/consumo/limpeza/plano/${id}`);
  return data; // { cicloId, plano: [...] }
}

/* ----- SANITÁRIO (Manejos & Exames) ----- */
export async function getManejosSanitarios() {
  const { data } = await apiV1.get('/consumo/sanitario/manejos');
  return Array.isArray(data?.items) ? data.items : [];
}
export async function createManejoSanitario(payload) {
  const { data } = await apiV1.post('/consumo/sanitario/manejos', payload);
  return data;
}
export async function updateManejoSanitario(id, patch) {
  const { data } = await apiV1.put(`/consumo/sanitario/manejos/${id}`, patch);
  return data;
}
export async function deleteManejoSanitario(id) {
  const { data } = await apiV1.delete(`/consumo/sanitario/manejos/${id}`);
  return data;
}
export async function registrarManejoSanitario(id, { data: dt, observacoes = '' }) {
  const { data } = await apiV1.post(`/consumo/sanitario/manejos/${id}/registro`, {
    data: dt,
    observacoes,
  });
  return data;
}

export async function getExamesSanitarios() {
  const { data } = await apiV1.get('/consumo/sanitario/exames');
  return Array.isArray(data?.items) ? data.items : [];
}
export async function createExameSanitario(payload) {
  const { data } = await apiV1.post('/consumo/sanitario/exames', payload);
  return data;
}

/* ========= Health ========= */
export async function ping() {
  const { data } = await apiAuth.get('/health'); // /api/health
  return data;
}

/* ========= Aliases compat ========= */
export const buscarTodosAnimais = getAnimais;
export const buscarAnimalPorId = getAnimal;
export const salvarAnimais = async (animais) =>
  Promise.all((animais || []).map((a) => (a.id ? atualizarAnimal(a.id, a) : criarAnimal(a))));
export const atualizarAnimalNoBanco = (animal) => atualizarAnimal(animal.id, animal);
export const excluirAnimal = removerAnimal;

// export default mantém compat (aponta para /api/v1)
export default apiV1;
