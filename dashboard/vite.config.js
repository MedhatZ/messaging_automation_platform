import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Use IPv4 loopback to avoid ::1 issues on Windows
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: true,
      },
      '/leads': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/conversations': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/orders': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/products': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/faq': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/broadcast': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/tenants': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/whatsapp-accounts': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/upload': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
