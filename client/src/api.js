import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api' // <- backend porta 3001
});

export default api;
