import { io } from 'socket.io-client';

let socket = null;

const API_URL = import.meta.env.VITE_API_URL ?? '';
const normalizedBaseUrl = API_URL.replace(/\/+$/, '');

function getToken() {
  return localStorage.getItem('accessToken') || '';
}

export const socketService = {
  /**
   * Connect to the conversations namespace using JWT auth.
   * @param {{ token?: string }} opts
   */
  connect(opts = {}) {
    const token = (opts.token || getToken()).trim();
    if (!token) return null;

    if (socket && socket.connected) return socket;

    const url = normalizedBaseUrl ? `${normalizedBaseUrl}/conversations` : '/conversations';

    // Same-origin connection (Vite proxy handles /socket.io in dev).
    socket = io(url, {
      path: '/socket.io',
      transports: ['websocket'],
      autoConnect: true,
      auth: { token },
    });

    return socket;
  },

  disconnect() {
    if (!socket) return;
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } finally {
      socket = null;
    }
  },

  getSocket() {
    return socket;
  },

  joinConversation(conversationId, agentName) {
    if (!socket || !conversationId) return;
    socket.emit('join', { conversationId, agentName });
  },

  leaveConversation(conversationId) {
    if (!socket || !conversationId) return;
    socket.emit('leave', { conversationId });
  },

  typingStart(conversationId) {
    if (!socket || !conversationId) return;
    socket.emit('typing_start', { conversationId });
  },

  typingStop(conversationId) {
    if (!socket || !conversationId) return;
    socket.emit('typing_stop', { conversationId });
  },

  on(event, handler) {
    if (!socket) return;
    socket.on(event, handler);
  },

  off(event, handler) {
    if (!socket) return;
    socket.off(event, handler);
  },
};

