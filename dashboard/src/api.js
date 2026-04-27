import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const normalizedBaseUrl = API_URL.replace(/\/+$/, '');

export const api = axios.create({
  baseURL: normalizedBaseUrl,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
