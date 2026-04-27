import { io } from 'socket.io-client';

let socket = null;

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

    // Same-origin connection (Vite proxy handles /socket.io in dev).
    socket = io('/conversations', {
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

