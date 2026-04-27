import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from './api.js';
import { useAuth } from './auth/AuthContext.jsx';
import { LanguageSwitcher } from './components/LanguageSwitcher.jsx';
import { socketService } from './services/socket.service.js';

function formatDate(iso, locale) {
  if (!iso) return '\u2014';
  try {
    const loc = locale?.startsWith('ar') ? 'ar' : 'en';
    return new Date(iso).toLocaleString(loc);
  } catch {
    return iso;
  }
}

function statusClass(status) {
  if (status === 'NEW') return 'status status-new';
  if (status === 'CONTACTED') return 'status status-contacted';
  if (status === 'CLOSED') return 'status status-closed';
  return 'status';
}

function basenameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const seg = path.split('/').filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : url;
  } catch {
    return url.length > 48 ? `${url.slice(0, 45)}…` : url;
  }
}

export default function MessagingDashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const tenantId = user?.tenantId ?? '';
  const dir = i18n.language?.startsWith('ar') ? 'rtl' : 'ltr';
  const locale = i18n.language;
  const agentName = useMemo(() => user?.email || user?.userId || 'agent', [user]);

  const [view, setView] = useState('leads');
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Store settings
  const [settings, setSettings] = useState({
    storeName: '',
    slug: '',
    welcomeMessage: '',
    welcomeImages: [],
    welcomeVideos: [],
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingWelcomeImages, setUploadingWelcomeImages] = useState(false);
  const [uploadingWelcomeVideos, setUploadingWelcomeVideos] = useState(false);

  // Broadcast
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastFilter, setBroadcastFilter] = useState('all');
  const [broadcastResult, setBroadcastResult] = useState(null);
  const [broadcasting, setBroadcasting] = useState(false);

  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(true);

  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(false);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productAffinity, setProductAffinity] = useState({});
  const [productForm, setProductForm] = useState({
    name: '',
    price: '',
    imageUrls: [],
    keywords: '',
  });
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingProductImages, setUploadingProductImages] = useState(false);

  const [faqs, setFaqs] = useState([]);
  const [faqsLoading, setFaqsLoading] = useState(false);
  const [faqForm, setFaqForm] = useState({
    questionAr: '',
    questionEn: '',
    answerAr: '',
    answerEn: '',
    keywordsAr: '',
    keywordsEn: '',
    priority: '0',
  });
  const [savingFaq, setSavingFaq] = useState(false);
  const [faqEdit, setFaqEdit] = useState(null);
  const [savingFaqEdit, setSavingFaqEdit] = useState(false);
  const [busyFaqId, setBusyFaqId] = useState(null);

  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [selectedConvId, setSelectedConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const selectedConvIdRef = useRef(null);

  const [memoryStats, setMemoryStats] = useState(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryResults, setMemoryResults] = useState([]);
  const [memorySearching, setMemorySearching] = useState(false);
  const [memoryClearing, setMemoryClearing] = useState(false);

  const [recommendations, setRecommendations] = useState([]);
  const [recsLoading, setRecsLoading] = useState(false);

  const [socketConnected, setSocketConnected] = useState(false);
  const [typingStatus, setTypingStatus] = useState(null); // { conversationId, status, at }
  const [lastAgentJoined, setLastAgentJoined] = useState(null); // { agentName, at }
  const [agentDraft, setAgentDraft] = useState('');
  const typingTimerRef = useRef(null);

  const tenantReady = Boolean(tenantId && tenantId.length > 10);

  const [baileysQr, setBaileysQr] = useState(null);
  const [baileysConnected, setBaileysConnected] = useState(false);
  const [baileysLoading, setBaileysLoading] = useState(false);
  const [baileysError, setBaileysError] = useState(null);

  const loadBaileysQr = useCallback(async () => {
    setBaileysLoading(true);
    setBaileysError(null);
    try {
      const { data } = await api.get('/baileys/qr');
      setBaileysQr(data?.qr ?? null);
      setBaileysConnected(Boolean(data?.connected));
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'فشل تحميل QR';
      setBaileysError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setBaileysQr(null);
      setBaileysConnected(false);
    } finally {
      setBaileysLoading(false);
    }
  }, []);

  const loadLeads = useCallback(async () => {
    setError(null);
    setLeadsLoading(true);
    try {
      const { data } = await api.get('/leads');
      setLeads(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.message ||
        t('errors.loadLeads');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  }, [t]);

  const loadConversations = useCallback(async () => {
    setError(null);
    setConvLoading(true);
    try {
      const { data } = await api.get('/conversations');
      setConversations(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.message ||
        t('errors.loadConversations');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setConversations([]);
    } finally {
      setConvLoading(false);
    }
  }, [t]);

  const loadProducts = useCallback(async () => {
    setError(null);
    setProductsLoading(true);
    try {
      const { data } = await api.get('/products');
      const rows = Array.isArray(data) ? data : [];
      setProducts(rows);
      const affinities = await Promise.all(
        rows.slice(0, 50).map(async (p) => {
          try {
            const res = await api.get(`/products/affinity/${p.id}`);
            return [p.id, res.data];
          } catch {
            return [p.id, null];
          }
        }),
      );
      const map = {};
      affinities.forEach(([id, a]) => {
        if (a) map[id] = a;
      });
      setProductAffinity(map);
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.message ||
        t('errors.loadProducts');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, [t]);

  const loadFaqs = useCallback(async () => {
    setError(null);
    setFaqsLoading(true);
    try {
      const { data } = await api.get('/faq');
      setFaqs(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg =
        e.response?.data?.message || e.message || t('errors.loadFaq');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setFaqs([]);
    } finally {
      setFaqsLoading(false);
    }
  }, [t]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/conversations/stats');
      setStats(data ?? null);
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'فشل تحميل التقارير';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/orders');
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'فشل تحميل الطلبات';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/tenants/settings');
      const next = data ?? {};
      const imgs = Array.isArray(next.welcomeImages) ? next.welcomeImages : [];
      const vids = Array.isArray(next.welcomeVideos) ? next.welcomeVideos : [];
      setSettings({
        storeName: next.storeName ?? '',
        slug: next.slug ?? '',
        welcomeMessage: next.welcomeMessage ?? '',
        welcomeImages: imgs,
        welcomeVideos: vids,
      });
    } catch (e) {
      const msg =
        e.response?.data?.message || e.message || 'فشل تحميل الإعدادات';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tenantReady) return;
    if (view === 'leads') loadLeads();
    else if (view === 'conversations') loadConversations();
    else if (view === 'products') loadProducts();
    else if (view === 'faq') loadFaqs();
    else if (view === 'stats') loadStats();
    else if (view === 'orders') loadOrders();
    else if (view === 'settings') loadSettings();
  }, [
    view,
    tenantReady,
    loadLeads,
    loadConversations,
    loadProducts,
    loadFaqs,
    loadStats,
    loadOrders,
    loadSettings,
  ]);

  async function updateOrderStatus(id, status) {
    try {
      await api.patch(`/orders/${id}`, { status });
      await loadOrders();
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'فشل التحديث';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSavingSettings(true);
    setError(null);
    try {
      const payload = {
        storeName: settings.storeName,
        slug: settings.slug,
        welcomeMessage: settings.welcomeMessage,
        welcomeImages: settings.welcomeImages,
        welcomeVideos: settings.welcomeVideos,
      };
      const { data } = await api.patch('/tenants/settings', payload);
      const imgs = Array.isArray(data?.welcomeImages)
        ? data.welcomeImages
        : settings.welcomeImages;
      const vids = Array.isArray(data?.welcomeVideos)
        ? data.welcomeVideos
        : settings.welcomeVideos;
      setSettings((prev) => ({
        ...prev,
        welcomeImages: imgs,
        welcomeVideos: vids,
      }));
    } catch (e) {
      const msg =
        e.response?.data?.message || e.message || 'فشل حفظ الإعدادات';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSavingSettings(false);
    }
  }

  async function uploadWelcomeImages(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setError(null);
    setUploadingWelcomeImages(true);
    try {
      const formData = new FormData();
      files.slice(0, 20).forEach((file) => formData.append('files', file));
      const { data } = await api.post('/upload/images', formData);
      const urls = Array.isArray(data?.urls) ? data.urls : [];
      setSettings((prev) => ({
        ...prev,
        welcomeImages: [...prev.welcomeImages, ...urls].slice(0, 20),
      }));
    } catch (e) {
      const msg =
        e.response?.data?.message || e.message || 'فشل رفع الصور';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setUploadingWelcomeImages(false);
    }
  }

  async function uploadWelcomeVideos(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setError(null);
    setUploadingWelcomeVideos(true);
    try {
      const formData = new FormData();
      files.slice(0, 10).forEach((file) => formData.append('files', file));
      const { data } = await api.post('/upload/videos', formData);
      const urls = Array.isArray(data?.urls) ? data.urls : [];
      setSettings((prev) => ({
        ...prev,
        welcomeVideos: [...prev.welcomeVideos, ...urls].slice(0, 10),
      }));
    } catch (e) {
      const msg =
        e.response?.data?.message || e.message || 'فشل رفع الفيديو';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setUploadingWelcomeVideos(false);
    }
  }

  function removeWelcomeImage(index) {
    setSettings((prev) => ({
      ...prev,
      welcomeImages: prev.welcomeImages.filter((_, i) => i !== index),
    }));
  }

  function removeWelcomeVideo(index) {
    setSettings((prev) => ({
      ...prev,
      welcomeVideos: prev.welcomeVideos.filter((_, i) => i !== index),
    }));
  }

  async function sendBroadcast(e) {
    e.preventDefault();
    const msg = broadcastMsg.trim();
    if (!msg) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    setError(null);
    try {
      const { data } = await api.post('/broadcast', {
        tenantId,
        message: msg,
        filter: broadcastFilter,
      });
      setBroadcastResult(data);
      setBroadcastMsg('');
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'فشل الإرسال';
      setError(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
    } finally {
      setBroadcasting(false);
    }
  }

  async function patchStatus(id, status) {
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/leads/${id}`, { status });
      await loadLeads();
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.message ||
        t('errors.updateFailed');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setBusyId(null);
    }
  }

  async function openConversation(id) {
    setSelectedConvId(id);
    selectedConvIdRef.current = id;
    setMessages([]);
    setMsgLoading(true);
    setMemoryStats(null);
    setMemoryResults([]);
    setMemoryQuery('');
    setRecommendations([]);
    setError(null);
    try {
      const { data } = await api.get(`/conversations/${id}/messages`);
      setMessages(Array.isArray(data) ? data : []);
      const stats = await api.get(`/conversations/${id}/memory-stats`);
      setMemoryStats(stats?.data ?? null);
      setRecsLoading(true);
      const recs = await api.get(`/products/recommendations/${id}`);
      setRecommendations(Array.isArray(recs?.data) ? recs.data : []);

      socketService.joinConversation(id, agentName);
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.message ||
        t('errors.loadMessages');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setSelectedConvId(null);
    } finally {
      setMsgLoading(false);
      setRecsLoading(false);
    }
  }

  function closeConversation() {
    if (selectedConvIdRef.current) {
      socketService.leaveConversation(selectedConvIdRef.current);
    }
    setSelectedConvId(null);
    selectedConvIdRef.current = null;
    setMessages([]);
    setMemoryStats(null);
    setMemoryResults([]);
    setMemoryQuery('');
    setRecommendations([]);
    setTypingStatus(null);
    setLastAgentJoined(null);
    setAgentDraft('');
  }

  // Connect socket after login (token available)
  useEffect(() => {
    if (!token) {
      socketService.disconnect();
      setSocketConnected(false);
      return;
    }

    const s = socketService.connect({ token });
    if (!s) return;

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    const onNewMessage = (payload) => {
      const convId = payload?.conversationId;
      const msg = payload?.message;
      const at = payload?.at;
      if (!convId || !msg) return;

      // Update thread UI if this conversation is open
      if (selectedConvIdRef.current === convId) {
        setMessages((prev) => [
          ...(Array.isArray(prev) ? prev : []),
          {
            id: `${Date.now()}-${Math.random()}`,
            direction: msg.direction === 'OUTGOING' ? 'OUTGOING' : 'INCOMING',
            content: msg.content ?? '',
            createdAt: at ?? new Date().toISOString(),
          },
        ]);
      }

      // Update conversation list last message preview/time
      setConversations((prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((c) =>
          c.id !== convId
            ? c
            : {
                ...c,
                lastMessageAt: at ?? c.lastMessageAt,
                lastMessageContent: msg.content ?? c.lastMessageContent,
              },
        );
      });
    };

    const onConversationUpdated = (payload) => {
      const convId = payload?.conversationId;
      const data = payload?.data;
      const at = payload?.at;
      if (!convId) return;

      setConversations((prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((c) =>
          c.id !== convId
            ? c
            : {
                ...c,
                ...(data?.lastMessageAt ? { lastMessageAt: data.lastMessageAt } : {}),
                ...(at && !data?.lastMessageAt ? { lastMessageAt: at } : {}),
              },
        );
      });
    };

    const onAgentJoined = (payload) => {
      const convId = payload?.conversationId;
      if (!convId) return;
      if (selectedConvIdRef.current !== convId) return;
      setLastAgentJoined({
        agentName: payload?.agentName ?? '',
        at: payload?.at ?? new Date().toISOString(),
      });
    };

    const onTyping = (payload) => {
      const convId = payload?.conversationId;
      if (!convId) return;
      if (selectedConvIdRef.current !== convId) return;
      setTypingStatus({
        conversationId: convId,
        status: payload?.status ?? 'start',
        at: payload?.at ?? new Date().toISOString(),
      });
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);

    // Support both snake_case and dash-case event names
    s.on('new_message', onNewMessage);
    s.on('new-message', onNewMessage);
    s.on('conversation_updated', onConversationUpdated);
    s.on('conversation-updated', onConversationUpdated);
    s.on('agent_joined', onAgentJoined);
    s.on('agent-joined', onAgentJoined);
    s.on('typing', onTyping);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('new_message', onNewMessage);
      s.off('new-message', onNewMessage);
      s.off('conversation_updated', onConversationUpdated);
      s.off('conversation-updated', onConversationUpdated);
      s.off('agent_joined', onAgentJoined);
      s.off('agent-joined', onAgentJoined);
      s.off('typing', onTyping);
    };
  }, [token, agentName]);

  function handleAgentDraftChange(next) {
    setAgentDraft(next);
    const convId = selectedConvIdRef.current;
    if (!convId) return;

    socketService.typingStart(convId);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socketService.typingStop(convId);
    }, 1200);
  }

  async function refreshMemoryStats() {
    if (!selectedConvId) return;
    setMemoryLoading(true);
    setError(null);
    try {
      const { data } = await api.get(
        `/conversations/${selectedConvId}/memory-stats`,
      );
      setMemoryStats(data ?? null);
    } catch (e) {
      const msg = e.response?.data?.message || e.message || t('errors.deleteFailed');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setMemoryLoading(false);
    }
  }

  async function searchMemory() {
    if (!selectedConvId) return;
    const q = memoryQuery.trim();
    if (!q) return;
    setMemorySearching(true);
    setError(null);
    try {
      const { data } = await api.get(
        `/conversations/${selectedConvId}/memory/search`,
        { params: { q } },
      );
      setMemoryResults(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg = e.response?.data?.message || e.message || t('errors.loadMessages');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setMemoryResults([]);
    } finally {
      setMemorySearching(false);
    }
  }

  async function clearMemory() {
    if (!selectedConvId) return;
    if (!window.confirm(t('memory.confirmClear'))) return;
    setMemoryClearing(true);
    setError(null);
    try {
      await api.delete(`/conversations/${selectedConvId}/memory`);
      setMemoryResults([]);
      await refreshMemoryStats();
    } catch (e) {
      const msg = e.response?.data?.message || e.message || t('errors.deleteFailed');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setMemoryClearing(false);
    }
  }

  function parseKeywords(raw) {
    if (!raw || typeof raw !== 'string') return [];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function handleProductImagesChange(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setError(null);
    const remaining = 20 - productForm.imageUrls.length;
    if (remaining <= 0) {
      setError(t('products.maxImages'));
      return;
    }
    const batch = files.slice(0, remaining);
    setUploadingProductImages(true);
    try {
      const formData = new FormData();
      batch.forEach((file) => formData.append('files', file));
      const { data } = await api.post('/upload/images', formData);
      const urls = Array.isArray(data?.urls) ? data.urls : [];
      setProductForm((prev) => ({
        ...prev,
        imageUrls: [...prev.imageUrls, ...urls].slice(0, 20),
      }));
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        t('errors.uploadImagesFailed');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setUploadingProductImages(false);
    }
  }

  function removeProductImageAt(index) {
    setProductForm((f) => ({
      ...f,
      imageUrls: f.imageUrls.filter((_, i) => i !== index),
    }));
  }

  async function submitProduct(e) {
    e.preventDefault();
    const name = productForm.name.trim();
    const price = Number(productForm.price);
    if (!name) {
      setError(t('errors.productNameRequired'));
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError(t('errors.productPriceInvalid'));
      return;
    }
    setSavingProduct(true);
    setError(null);
    const payload = {
      name,
      price,
      keywords: parseKeywords(productForm.keywords),
      ...(productForm.imageUrls.length > 0
        ? { imageUrls: productForm.imageUrls }
        : {}),
    };
    try {
      await api.post('/products', payload);
      setProductForm({ name: '', price: '', imageUrls: [], keywords: '' });
      await loadProducts();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        t('errors.createProductFailed');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSavingProduct(false);
    }
  }

  async function deleteProduct(id) {
    if (!window.confirm(t('products.confirmDelete'))) return;
    setBusyId(id);
    setError(null);
    try {
      await api.delete(`/products/${id}`);
      await loadProducts();
    } catch (e) {
      const msg =
        e.response?.data?.message || e.message || t('errors.deleteFailed');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setBusyId(null);
    }
  }

  function keywordsDisplay(keywords, emptyLabel) {
    if (!Array.isArray(keywords) || keywords.length === 0) return emptyLabel;
    return keywords.join(', ');
  }

  function parsePriority(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
    return n;
  }

  async function submitFaq(e) {
    e.preventDefault();
    const questionAr = faqForm.questionAr.trim();
    const answerAr = faqForm.answerAr.trim();
    const priority = parsePriority(faqForm.priority);
    if (!questionAr) {
      setError(t('errors.faqQuestionArRequired'));
      return;
    }
    if (!answerAr) {
      setError(t('errors.faqAnswerArRequired'));
      return;
    }
    if (priority === null) {
      setError(t('errors.faqPriorityInvalid'));
      return;
    }
    setSavingFaq(true);
    setError(null);
    try {
      await api.post('/faq', {
        questionAr,
        questionEn: faqForm.questionEn.trim(),
        answerAr,
        answerEn: faqForm.answerEn.trim(),
        keywordsAr: parseKeywords(faqForm.keywordsAr),
        keywordsEn: parseKeywords(faqForm.keywordsEn),
        priority,
      });
      setFaqForm({
        questionAr: '',
        questionEn: '',
        answerAr: '',
        answerEn: '',
        keywordsAr: '',
        keywordsEn: '',
        priority: '0',
      });
      await loadFaqs();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        t('errors.createFaqFailed');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSavingFaq(false);
    }
  }

  async function saveFaqEdit(e) {
    e.preventDefault();
    if (!faqEdit) return;
    const questionAr = faqEdit.questionAr.trim();
    const answerAr = faqEdit.answerAr.trim();
    const priority = parsePriority(faqEdit.priority);
    if (!questionAr || !answerAr) {
      setError(t('errors.faqArabicRequired'));
      return;
    }
    if (priority === null) {
      setError(t('errors.faqPriorityInvalid'));
      return;
    }
    setSavingFaqEdit(true);
    setError(null);
    try {
      await api.patch(`/faq/${faqEdit.id}`, {
        questionAr,
        questionEn: faqEdit.questionEn.trim(),
        answerAr,
        answerEn: faqEdit.answerEn.trim(),
        keywordsAr: parseKeywords(faqEdit.keywordsAr),
        keywordsEn: parseKeywords(faqEdit.keywordsEn),
        priority,
      });
      setFaqEdit(null);
      await loadFaqs();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        t('errors.updateFaqFailed');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSavingFaqEdit(false);
    }
  }

  async function deleteFaq(id) {
    if (!window.confirm(t('faq.confirmDelete'))) return;
    setBusyFaqId(id);
    setError(null);
    try {
      await api.delete(`/faq/${id}`);
      await loadFaqs();
    } catch (e) {
      const msg =
        e.response?.data?.message || e.message || t('errors.deleteFailed');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setBusyFaqId(null);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  function openFaqEdit(row) {
    setError(null);
    setFaqEdit({
      id: row.id,
      questionAr: row.questionAr ?? '',
      questionEn: row.questionEn ?? '',
      answerAr: row.answerAr ?? '',
      answerEn: row.answerEn ?? '',
      keywordsAr: Array.isArray(row.keywordsAr) ? row.keywordsAr.join(', ') : '',
      keywordsEn: Array.isArray(row.keywordsEn) ? row.keywordsEn.join(', ') : '',
      priority: String(row.priority ?? 0),
    });
  }

  const dash = t('common.empty');

  return (
    <div className="app" dir={dir}>
      <header className="app-header">
        <div className="app-header-main">
          <h1>{t('app.title')}</h1>
          <p>{t('app.subtitle')}</p>
        </div>
        <div className="app-header-actions">
          <LanguageSwitcher />
          <button type="button" className="btn-logout" onClick={handleLogout}>
            {t('auth.logout')}
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label={t('aria.mainNav')}>
        <button
          type="button"
          className={view === 'leads' ? 'tab active' : 'tab'}
          onClick={() => {
            setView('leads');
            closeConversation();
          }}
        >
          {t('tabs.leads')}
        </button>
        <button
          type="button"
          className={view === 'conversations' ? 'tab active' : 'tab'}
          onClick={() => {
            setView('conversations');
            closeConversation();
          }}
        >
          {t('tabs.conversations')}
        </button>
        <button
          type="button"
          className={view === 'products' ? 'tab active' : 'tab'}
          onClick={() => {
            setView('products');
            closeConversation();
          }}
        >
          {t('tabs.products')}
        </button>
        <button
          type="button"
          className={view === 'faq' ? 'tab active' : 'tab'}
          onClick={() => {
            setView('faq');
            closeConversation();
          }}
        >
          {t('tabs.faq')}
        </button>
        <button
          type="button"
          className={view === 'stats' ? 'tab active' : 'tab'}
          onClick={() => {
            setView('stats');
            closeConversation();
          }}
        >
          📊 التقارير
        </button>
        <button
          type="button"
          className={view === 'orders' ? 'tab active' : 'tab'}
          onClick={() => {
            setView('orders');
            closeConversation();
          }}
        >
          📦 الطلبات
        </button>
        <button
          type="button"
          className={view === 'settings' ? 'tab active' : 'tab'}
          onClick={() => {
            setView('settings');
            closeConversation();
          }}
        >
          ⚙️ الإعدادات
        </button>
        <button
          type="button"
          className={view === 'wa_qr' ? 'tab active' : 'tab'}
          onClick={() => {
            setView('wa_qr');
            closeConversation();
            void loadBaileysQr();
          }}
        >
          📱 واتساب QR
        </button>
        <Link to="/dashboard/whatsapp-accounts" className="tab">
          {t('tabs.waAccounts')}
        </Link>
      </nav>

      {!tenantReady && (
        <div className="banner">{t('banner.noTenant')}</div>
      )}

      {error && <div className="error">{error}</div>}
      <div className="banner" style={{ marginTop: 10 }}>
        {t('realtime.status')}: {socketConnected ? t('realtime.connected') : t('realtime.disconnected')}
      </div>

      {view === 'leads' && (
        <>
          <h2 className="section-title">{t('leads.title')}</h2>
          {leadsLoading ? (
            <div className="loading">{t('loading.generic')}</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('leads.name')}</th>
                    <th>{t('leads.phone')}</th>
                    <th>{t('leads.interest')}</th>
                    <th>{t('leads.status')}</th>
                    <th>{t('leads.createdAt')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: '#666' }}>
                        {t('leads.empty')}
                      </td>
                    </tr>
                  ) : (
                    leads.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name ?? dash}</td>
                        <td>{row.phone ?? dash}</td>
                        <td>{row.interest ?? dash}</td>
                        <td>
                          <span className={statusClass(row.status)}>{row.status}</span>
                        </td>
                        <td>{formatDate(row.createdAt, locale)}</td>
                        <td>
                          <div className="actions">
                            <button
                              type="button"
                              className="btn-contacted"
                              disabled={busyId === row.id || row.status === 'CONTACTED'}
                              onClick={() => patchStatus(row.id, 'CONTACTED')}
                            >
                              {t('leads.contacted')}
                            </button>
                            <button
                              type="button"
                              className="btn-closed"
                              disabled={busyId === row.id || row.status === 'CLOSED'}
                              onClick={() => patchStatus(row.id, 'CLOSED')}
                            >
                              {t('leads.closed')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {view === 'conversations' && (
        <>
          <h2 className="section-title">{t('conversations.title')}</h2>
          {convLoading ? (
            <div className="loading">{t('loading.generic')}</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('conversations.name')}</th>
                    <th>{t('conversations.phone')}</th>
                    <th>{t('conversations.lastMessage')}</th>
                    <th>{t('conversations.time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {conversations.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: '#666' }}>
                        {t('conversations.empty')}
                      </td>
                    </tr>
                  ) : (
                    conversations.map((row) => (
                      <tr
                        key={row.id}
                        className="row-click"
                        onClick={() => openConversation(row.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openConversation(row.id);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={t('aria.openConversation')}
                      >
                        <td>{row.externalUserName ?? dash}</td>
                        <td>{row.externalUserId}</td>
                        <td className="cell-clip">
                          {row.lastMessageContent ?? dash}
                        </td>
                        <td>{formatDate(row.lastMessageAt, locale)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {selectedConvId && (
            <div className="thread-panel">
              <div className="thread-head">
                <h3>{t('conversations.threadTitle')}</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn-delete"
                    disabled={memoryClearing}
                    onClick={() => void clearMemory()}
                  >
                    {memoryClearing ? t('memory.clearing') : t('memory.clear')}
                  </button>
                  <button type="button" className="btn-close" onClick={closeConversation}>
                    {t('common.close')}
                  </button>
                </div>
              </div>

              {(lastAgentJoined || typingStatus?.status === 'start') && (
                <div className="banner" style={{ marginTop: 10 }}>
                  {lastAgentJoined
                    ? t('realtime.agentJoined', { name: lastAgentJoined.agentName })
                    : null}
                  {typingStatus?.status === 'start'
                    ? ` ${t('realtime.typing')}`
                    : null}
                </div>
              )}

              <div className="table-wrap" style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong>{t('memory.statsTitle')}</strong>
                  <span>
                    {t('memory.count')}: {memoryStats?.count ?? t('common.empty')}
                  </span>
                  <span>
                    {t('memory.oldest')}: {memoryStats?.oldest ? formatDate(memoryStats.oldest, locale) : t('common.empty')}
                  </span>
                  <span>
                    {t('memory.newest')}: {memoryStats?.newest ? formatDate(memoryStats.newest, locale) : t('common.empty')}
                  </span>
                  <button
                    type="button"
                    className="btn-edit"
                    disabled={memoryLoading}
                    onClick={() => void refreshMemoryStats()}
                  >
                    {memoryLoading ? t('loading.generic') : t('memory.refresh')}
                  </button>
                </div>

                <div style={{ marginTop: 10 }}>
                  <strong>{t('memory.searchTitle')}</strong>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={memoryQuery}
                      onChange={(e) => setMemoryQuery(e.target.value)}
                      placeholder={t('memory.searchPlaceholder')}
                      style={{ flex: '1 1 240px' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void searchMemory();
                      }}
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={memorySearching || !memoryQuery.trim()}
                      onClick={() => void searchMemory()}
                    >
                      {memorySearching ? t('memory.searching') : t('memory.search')}
                    </button>
                  </div>

                  {memoryResults.length > 0 && (
                    <ul style={{ marginTop: 10, paddingInlineStart: 18 }}>
                      {memoryResults.map((r) => (
                        <li key={r.id} style={{ marginBottom: 6 }}>
                          <span style={{ fontWeight: 600 }}>
                            {r.role === 'user' ? t('conversations.user') : t('conversations.bot')}
                          </span>
                          {typeof r.similarity === 'number' ? (
                            <span style={{ color: '#666' }}>
                              {' '}
                              ({t('memory.similarity')}: {r.similarity.toFixed(3)})
                            </span>
                          ) : null}
                          <div style={{ whiteSpace: 'pre-wrap' }}>{r.messageText}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="table-wrap" style={{ marginTop: 10 }}>
                <strong>{t('realtime.agentTypingBoxTitle')}</strong>
                <textarea
                  rows={2}
                  value={agentDraft}
                  onChange={(e) => handleAgentDraftChange(e.target.value)}
                  placeholder={t('realtime.agentTypingBoxPlaceholder')}
                  style={{ width: '100%', marginTop: 6 }}
                />
              </div>

              <div className="table-wrap" style={{ marginTop: 10 }}>
                <strong>{t('products.recommendedForCustomer')}</strong>
                {recsLoading ? (
                  <div className="loading">{t('loading.generic')}</div>
                ) : recommendations.length === 0 ? (
                  <div style={{ color: '#666', marginTop: 6 }}>
                    {t('products.noRecommendations')}
                  </div>
                ) : (
                  <ul style={{ marginTop: 10, paddingInlineStart: 18 }}>
                    {recommendations.map((r) => (
                      <li key={r.productId} style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 600 }}>
                          {r.name} — {Number(r.price).toLocaleString(locale)} EGP
                        </div>
                        <div style={{ color: '#666' }}>
                          {t('products.recommendationReason')}: {r.reason} •{' '}
                          {t('products.recommendationScore')}:{' '}
                          {Number(r.score).toFixed(2)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {msgLoading ? (
                <div className="loading">{t('loading.messages')}</div>
              ) : (
                <ul className="thread">
                  {messages.length === 0 ? (
                    <li className="thread-empty">{t('conversations.noMessages')}</li>
                  ) : (
                    messages.map((m) => (
                      <li
                        key={m.id}
                        className={
                          m.direction === 'INCOMING'
                            ? 'bubble bubble-in'
                            : 'bubble bubble-out'
                        }
                      >
                        <span className="bubble-label">
                          {m.direction === 'INCOMING'
                            ? t('conversations.user')
                            : t('conversations.bot')}
                        </span>
                        <p className="bubble-text">{m.content}</p>
                        <span className="bubble-time">{formatDate(m.createdAt, locale)}</span>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {view === 'products' && (
        <>
          <h2 className="section-title">{t('products.title')}</h2>

          <form className="product-form" onSubmit={submitProduct}>
            <h3 className="form-title">{t('products.addTitle')}</h3>
            <div className="form-grid">
              <label className="field">
                <span>{t('products.name')}</span>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) =>
                    setProductForm((f) => ({ ...f, name: e.target.value }))
                  }
                  maxLength={500}
                  required
                />
              </label>
              <label className="field">
                <span>{t('products.price')}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={productForm.price}
                  onChange={(e) =>
                    setProductForm((f) => ({ ...f, price: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="field field-wide">
                <span>{t('products.images')}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={
                    uploadingProductImages ||
                    savingProduct ||
                    productForm.imageUrls.length >= 20
                  }
                  onChange={(ev) => void handleProductImagesChange(ev)}
                />
                <p className="field-hint">
                  {uploadingProductImages
                    ? t('products.uploadingImages')
                    : t('products.imagesHint', { count: productForm.imageUrls.length })}
                </p>
                {productForm.imageUrls.length > 0 && (
                  <div className="product-image-preview-grid">
                    {productForm.imageUrls.map((url, idx) => (
                      <div key={`${url}-${idx}`} className="product-image-preview-cell">
                        <img src={url} alt="" className="product-image-preview-thumb" />
                        <button
                          type="button"
                          className="product-image-preview-remove"
                          onClick={() => removeProductImageAt(idx)}
                          aria-label={t('products.removeImage')}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </label>
              <label className="field field-wide">
                <span>{t('common.keywords')}</span>
                <input
                  type="text"
                  placeholder={t('products.keywordsPlaceholder')}
                  value={productForm.keywords}
                  onChange={(e) =>
                    setProductForm((f) => ({ ...f, keywords: e.target.value }))
                  }
                />
              </label>
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={savingProduct || uploadingProductImages}
            >
              {savingProduct ? t('common.saving') : t('products.add')}
            </button>
          </form>

          {productsLoading ? (
            <div className="loading">{t('loading.generic')}</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('products.name')}</th>
                    <th>{t('products.price')}</th>
                    <th>{t('products.conversionRate')}</th>
                    <th>{t('products.image')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#666' }}>
                        {t('products.empty')}
                      </td>
                    </tr>
                  ) : (
                    products.map((row) => {
                      const primary =
                        Array.isArray(row.imageUrls) && row.imageUrls.length > 0
                          ? row.imageUrls[0]
                          : null;
                      const extra =
                        Array.isArray(row.imageUrls) && row.imageUrls.length > 1
                          ? row.imageUrls.length - 1
                          : 0;
                      const aff = productAffinity[row.id];
                      const cr =
                        typeof aff?.conversionRate === 'number'
                          ? aff.conversionRate
                          : null;
                      return (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{Number(row.price).toLocaleString(locale)}</td>
                        <td>{cr == null ? dash : `${(cr * 100).toFixed(1)}%`}</td>
                        <td className="cell-thumb">
                          {primary ? (
                            <a
                              href={primary}
                              target="_blank"
                              rel="noreferrer"
                              className="thumb-link"
                            >
                              <img
                                src={primary}
                                alt=""
                                className="thumb"
                                loading="lazy"
                              />
                              {extra > 0 ? (
                                <span className="thumb-more">+{extra}</span>
                              ) : null}
                            </a>
                          ) : (
                            dash
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-delete"
                            disabled={busyId === row.id}
                            onClick={() => deleteProduct(row.id)}
                          >
                            {t('common.delete')}
                          </button>
                        </td>
                      </tr>
                    );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {view === 'faq' && (
        <>
          <h2 className="section-title">{t('faq.title')}</h2>

          <form className="product-form" onSubmit={submitFaq}>
            <h3 className="form-title">{t('faq.addTitle')}</h3>
            <div className="form-grid">
              <label className="field field-wide">
                <span>{t('faq.questionAr')}</span>
                <input
                  type="text"
                  value={faqForm.questionAr}
                  onChange={(e) =>
                    setFaqForm((f) => ({ ...f, questionAr: e.target.value }))
                  }
                  maxLength={2000}
                  required
                />
              </label>
              <label className="field field-wide">
                <span>{t('faq.questionEn')}</span>
                <input
                  type="text"
                  value={faqForm.questionEn}
                  onChange={(e) =>
                    setFaqForm((f) => ({ ...f, questionEn: e.target.value }))
                  }
                  maxLength={2000}
                />
              </label>
              <label className="field field-wide">
                <span>{t('faq.answerAr')}</span>
                <textarea
                  rows={3}
                  value={faqForm.answerAr}
                  onChange={(e) =>
                    setFaqForm((f) => ({ ...f, answerAr: e.target.value }))
                  }
                  maxLength={10000}
                  required
                />
              </label>
              <label className="field field-wide">
                <span>{t('faq.answerEn')}</span>
                <textarea
                  rows={3}
                  value={faqForm.answerEn}
                  onChange={(e) =>
                    setFaqForm((f) => ({ ...f, answerEn: e.target.value }))
                  }
                  maxLength={10000}
                />
              </label>
              <label className="field field-wide">
                <span>{t('faq.keywordsAr')}</span>
                <input
                  type="text"
                  placeholder={t('faq.keywordsPlaceholder')}
                  value={faqForm.keywordsAr}
                  onChange={(e) =>
                    setFaqForm((f) => ({ ...f, keywordsAr: e.target.value }))
                  }
                />
              </label>
              <label className="field field-wide">
                <span>{t('faq.keywordsEn')}</span>
                <input
                  type="text"
                  placeholder={t('faq.keywordsPlaceholder')}
                  value={faqForm.keywordsEn}
                  onChange={(e) =>
                    setFaqForm((f) => ({ ...f, keywordsEn: e.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>{t('common.priority')}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={faqForm.priority}
                  onChange={(e) =>
                    setFaqForm((f) => ({ ...f, priority: e.target.value }))
                  }
                  required
                />
              </label>
            </div>
            <button type="submit" className="btn-primary" disabled={savingFaq}>
              {savingFaq ? t('common.saving') : t('faq.add')}
            </button>
          </form>

          {faqsLoading ? (
            <div className="loading">{t('loading.generic')}</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('faq.colQAr')}</th>
                    <th>{t('faq.colQEn')}</th>
                    <th>{t('faq.colAAr')}</th>
                    <th>{t('faq.colAEn')}</th>
                    <th>{t('faq.colKwAr')}</th>
                    <th>{t('faq.colKwEn')}</th>
                    <th>{t('common.priority')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {faqs.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: '#666' }}>
                        {t('faq.empty')}
                      </td>
                    </tr>
                  ) : (
                    faqs.map((row) => (
                      <tr key={row.id}>
                        <td className="cell-clip" title={row.questionAr}>
                          {row.questionAr || dash}
                        </td>
                        <td className="cell-clip" title={row.questionEn}>
                          {row.questionEn || dash}
                        </td>
                        <td className="cell-clip cell-answer" title={row.answerAr}>
                          {row.answerAr || dash}
                        </td>
                        <td className="cell-clip cell-answer" title={row.answerEn}>
                          {row.answerEn || dash}
                        </td>
                        <td className="cell-clip" title={keywordsDisplay(row.keywordsAr, dash)}>
                          {keywordsDisplay(row.keywordsAr, dash)}
                        </td>
                        <td className="cell-clip" title={keywordsDisplay(row.keywordsEn, dash)}>
                          {keywordsDisplay(row.keywordsEn, dash)}
                        </td>
                        <td>{row.priority ?? 0}</td>
                        <td>
                          <div className="actions">
                            <button
                              type="button"
                              className="btn-edit"
                              disabled={busyFaqId === row.id}
                              onClick={() => openFaqEdit(row)}
                            >
                              {t('common.edit')}
                            </button>
                            <button
                              type="button"
                              className="btn-delete"
                              disabled={busyFaqId === row.id}
                              onClick={() => deleteFaq(row.id)}
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {faqEdit && (
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !savingFaqEdit) {
                  setFaqEdit(null);
                }
              }}
            >
              <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="faq-edit-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="faq-edit-title">{t('faq.editTitle')}</h3>
                <form onSubmit={saveFaqEdit}>
                  <div className="form-grid modal-form">
                    <label className="field field-wide">
                      <span>{t('faq.questionAr')}</span>
                      <input
                        type="text"
                        value={faqEdit.questionAr}
                        onChange={(e) =>
                          setFaqEdit((f) =>
                            f ? { ...f, questionAr: e.target.value } : f
                          )
                        }
                        maxLength={2000}
                        required
                      />
                    </label>
                    <label className="field field-wide">
                      <span>{t('faq.questionEn')}</span>
                      <input
                        type="text"
                        value={faqEdit.questionEn}
                        onChange={(e) =>
                          setFaqEdit((f) =>
                            f ? { ...f, questionEn: e.target.value } : f
                          )
                        }
                        maxLength={2000}
                      />
                    </label>
                    <label className="field field-wide">
                      <span>{t('faq.answerAr')}</span>
                      <textarea
                        rows={4}
                        value={faqEdit.answerAr}
                        onChange={(e) =>
                          setFaqEdit((f) =>
                            f ? { ...f, answerAr: e.target.value } : f
                          )
                        }
                        maxLength={10000}
                        required
                      />
                    </label>
                    <label className="field field-wide">
                      <span>{t('faq.answerEn')}</span>
                      <textarea
                        rows={4}
                        value={faqEdit.answerEn}
                        onChange={(e) =>
                          setFaqEdit((f) =>
                            f ? { ...f, answerEn: e.target.value } : f
                          )
                        }
                        maxLength={10000}
                      />
                    </label>
                    <label className="field field-wide">
                      <span>{t('faq.keywordsAr')}</span>
                      <input
                        type="text"
                        placeholder={t('faq.keywordsPlaceholder')}
                        value={faqEdit.keywordsAr}
                        onChange={(e) =>
                          setFaqEdit((f) =>
                            f ? { ...f, keywordsAr: e.target.value } : f
                          )
                        }
                      />
                    </label>
                    <label className="field field-wide">
                      <span>{t('faq.keywordsEn')}</span>
                      <input
                        type="text"
                        placeholder={t('faq.keywordsPlaceholder')}
                        value={faqEdit.keywordsEn}
                        onChange={(e) =>
                          setFaqEdit((f) =>
                            f ? { ...f, keywordsEn: e.target.value } : f
                          )
                        }
                      />
                    </label>
                    <label className="field">
                      <span>{t('common.priority')}</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={faqEdit.priority}
                        onChange={(e) =>
                          setFaqEdit((f) =>
                            f ? { ...f, priority: e.target.value } : f
                          )
                        }
                        required
                      />
                    </label>
                  </div>
                  <div className="modal-actions">
                    <button
                      type="button"
                      onClick={() => !savingFaqEdit && setFaqEdit(null)}
                      disabled={savingFaqEdit}
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={savingFaqEdit}
                    >
                      {savingFaqEdit ? t('common.saving') : t('common.save')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {view === 'stats' && (
        <>
          <h2 style={{ marginBottom: '1rem' }}>📊 تقارير المبيعات</h2>

          {statsLoading ? (
            <div className="loading">جاري التحميل...</div>
          ) : stats ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem',
              }}
            >
              {[
                { label: 'إجمالي المحادثات', value: stats.total ?? 0, color: '#6366f1' },
                { label: 'عملاء جدد', value: stats.new ?? 0, color: '#64748b' },
                { label: 'مهتمون', value: stats.interested ?? 0, color: '#f59e0b' },
                { label: 'ساخنون 🔥', value: stats.hot ?? 0, color: '#ef4444' },
                { label: 'محادثات النهارده', value: stats.today ?? 0, color: '#10b981' },
              ].map((card) => (
                <div
                  key={card.label}
                  style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    textAlign: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '2rem',
                      fontWeight: 700,
                      color: card.color,
                    }}
                  >
                    {card.value}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
                    {card.label}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#64748b' }}>لا توجد بيانات</p>
          )}

          {stats?.topProducts?.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>🏆 أكتر المنتجات إثارةً للاهتمام</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>المنتج</th>
                      <th>عدد المرات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topProducts.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td>{p.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            <h3 style={{ marginBottom: '1rem' }}>📢 إرسال رسالة جماعية</h3>
            <form onSubmit={sendBroadcast}>
              <div className="form-grid">
                <label className="field field-wide">
                  <span>الرسالة</span>
                  <textarea
                    rows={3}
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    placeholder="اكتب رسالتك هنا..."
                    maxLength={1000}
                    required
                  />
                </label>
                <label className="field">
                  <span>إرسال لـ</span>
                  <select
                    value={broadcastFilter}
                    onChange={(e) => setBroadcastFilter(e.target.value)}
                  >
                    <option value="all">الكل</option>
                    <option value="new">عملاء جدد</option>
                    <option value="interested">المهتمون</option>
                    <option value="hot">الساخنون 🔥</option>
                  </select>
                </label>
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={broadcasting}
                style={{ marginTop: '1rem' }}
              >
                {broadcasting ? 'جاري الإرسال...' : '📤 إرسال'}
              </button>
            </form>

            {broadcastResult && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1rem',
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: '8px',
                  color: '#166534',
                }}
              >
                ✅ تم الإرسال — إجمالي: {broadcastResult.total} | تم: {broadcastResult.queued} | تخطي:{' '}
                {broadcastResult.skipped}
              </div>
            )}
          </div>
        </>
      )}

      {view === 'orders' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>📦 الطلبات</h2>
            <button className="btn-primary" onClick={loadOrders}>🔄 تحديث</button>
          </div>

          {ordersLoading ? (
            <div className="loading">جاري التحميل...</div>
          ) : orders.length === 0 ? (
            <p style={{ color: '#64748b', textAlign: 'center', marginTop: '2rem' }}>لا توجد طلبات بعد</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الاسم</th>
                    <th>التليفون</th>
                    <th>العنوان</th>
                    <th>الموقع</th>
                    <th>المنتجات</th>
                    <th>الإجمالي</th>
                    <th>ملاحظات</th>
                    <th>الحالة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(order.createdAt).toLocaleString('ar')}
                      </td>
                      <td>{order.customerName}</td>
                      <td>{order.customerPhone}</td>
                      <td>{order.customerAddress}</td>
                      <td>
                        {order.locationUrl ? (
                          <a href={order.locationUrl} target="_blank" rel="noreferrer">
                            📍 خرائط
                          </a>
                        ) : '—'}
                      </td>
                      <td>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                          {(Array.isArray(order.items) ? order.items : []).map((item, i) => (
                            <li key={i} style={{ fontSize: '0.85rem' }}>
                              {item.name} × {item.quantity} — {item.price * item.quantity} جنيه
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td style={{ fontWeight: 700, color: '#6366f1' }}>
                        {order.total} جنيه
                      </td>
                      <td>{order.notes || '—'}</td>
                      <td>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          background: order.status === 'confirmed' ? '#dcfce7' : order.status === 'cancelled' ? '#fee2e2' : '#fef9c3',
                          color: order.status === 'confirmed' ? '#166534' : order.status === 'cancelled' ? '#991b1b' : '#854d0e',
                        }}>
                          {order.status === 'confirmed' ? '✅ مؤكد' : order.status === 'cancelled' ? '❌ ملغي' : '⏳ جاري'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn-edit"
                            onClick={() => updateOrderStatus(order.id, 'confirmed')}
                          >
                            ✅ تأكيد
                          </button>
                          <button
                            className="btn-delete"
                            onClick={() => updateOrderStatus(order.id, 'cancelled')}
                          >
                            ❌ إلغاء
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {view === 'settings' && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2>⚙️ إعدادات المتجر</h2>
            <button
              className="btn-primary"
              onClick={() => void loadSettings()}
              disabled={settingsLoading || savingSettings}
            >
              🔄 تحديث
            </button>
          </div>

          {settingsLoading ? (
            <div className="loading">جاري التحميل...</div>
          ) : (
            <form className="product-form" onSubmit={saveSettings}>
              <h3 className="form-title">بيانات المتجر</h3>
              <div className="form-grid">
                <label className="field field-wide">
                  <span>اسم المتجر</span>
                  <input
                    type="text"
                    value={settings.storeName}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, storeName: e.target.value }))
                    }
                    maxLength={200}
                    required
                  />
                </label>

                <label className="field field-wide">
                  <span>Slug (رابط صفحة الشراء)</span>
                  <input
                    type="text"
                    value={settings.slug}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, slug: e.target.value }))
                    }
                    placeholder="tenant-slug"
                    maxLength={120}
                  />
                  <p className="field-hint">
                    صفحة الشراء:{' '}
                    <code>
                      {`https://messaging-automation-platform.vercel.app/shop.html?slug=${
                        settings.slug || 'tenant-slug'
                      }`}
                    </code>
                  </p>
                </label>

                <label className="field field-wide">
                  <span>رسالة الترحيب</span>
                  <textarea
                    rows={4}
                    value={settings.welcomeMessage}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, welcomeMessage: e.target.value }))
                    }
                    maxLength={2000}
                  />
                </label>

                <div className="field field-wide">
                  <span>صور الترحيب</span>
                  <label className="field field-wide" style={{ marginTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.9em', opacity: 0.9 }}>
                      رفع صور متعددة (حتى 20)
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(ev) => void uploadWelcomeImages(ev)}
                      disabled={
                        savingSettings ||
                        uploadingWelcomeImages ||
                        settings.welcomeImages.length >= 20
                      }
                    />
                  </label>
                  {uploadingWelcomeImages ? (
                    <p className="field-hint">جاري رفع الصور...</p>
                  ) : null}
                  {settings.welcomeImages.length > 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        marginTop: '0.75rem',
                      }}
                    >
                      {settings.welcomeImages.map((url, i) => (
                        <div
                          key={`${url}-${i}`}
                          style={{
                            position: 'relative',
                            border: '1px solid var(--border, #333)',
                            borderRadius: 8,
                            overflow: 'hidden',
                          }}
                        >
                          <img
                            src={url}
                            alt=""
                            style={{
                              width: 112,
                              height: 112,
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                          <button
                            type="button"
                            className="btn-delete"
                            style={{
                              position: 'absolute',
                              top: 4,
                              right: 4,
                              padding: '2px 8px',
                              fontSize: 12,
                            }}
                            onClick={() => removeWelcomeImage(i)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="field-hint">لا توجد صور بعد — ارفع من الزر أعلاه.</p>
                  )}
                </div>

                <div className="field field-wide">
                  <span>فيديوهات الترحيب</span>
                  <label className="field field-wide" style={{ marginTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.9em', opacity: 0.9 }}>
                      رفع فيديو واحد أو أكثر (حتى 10، الحد الأقصى ~16MB لكل ملف)
                    </span>
                    <input
                      type="file"
                      accept="video/*"
                      multiple
                      onChange={(ev) => void uploadWelcomeVideos(ev)}
                      disabled={
                        savingSettings ||
                        uploadingWelcomeVideos ||
                        settings.welcomeVideos.length >= 10
                      }
                    />
                  </label>
                  {uploadingWelcomeVideos ? (
                    <p className="field-hint">جاري رفع الفيديو...</p>
                  ) : null}
                  {settings.welcomeVideos.length > 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        marginTop: '0.75rem',
                      }}
                    >
                      {settings.welcomeVideos.map((url, i) => (
                        <div
                          key={`${url}-${i}`}
                          style={{
                            border: '1px solid var(--border, #333)',
                            borderRadius: 8,
                            padding: 8,
                            maxWidth: 220,
                          }}
                        >
                          <video
                            src={url}
                            muted
                            playsInline
                            preload="metadata"
                            style={{
                              width: '100%',
                              maxHeight: 120,
                              borderRadius: 6,
                              background: '#000',
                            }}
                          />
                          <div
                            style={{
                              fontSize: 12,
                              marginTop: 6,
                              wordBreak: 'break-all',
                              opacity: 0.85,
                            }}
                            title={url}
                          >
                            {basenameFromUrl(url)}
                          </div>
                          <button
                            type="button"
                            className="btn-delete"
                            style={{ marginTop: 8, width: '100%' }}
                            onClick={() => removeWelcomeVideo(i)}
                          >
                            حذف
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="field-hint">لا توجد فيديوهات بعد.</p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={savingSettings}
              >
                {savingSettings ? 'جاري الحفظ...' : '💾 حفظ'}
              </button>
            </form>
          )}
        </>
      )}

      {view === 'wa_qr' && (
        <>
          <h2 className="section-title">📱 واتساب QR</h2>

          {baileysError && <div className="error">{baileysError}</div>}

          <div className="table-wrap" style={{ marginTop: 10 }}>
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className="btn-primary"
                onClick={() => void loadBaileysQr()}
                disabled={baileysLoading}
              >
                {baileysLoading ? 'جاري التحميل...' : '🔄 تحديث'}
              </button>
              <span>
                الحالة: {baileysConnected ? '✅ واتساب متصل' : '⏳ غير متصل'}
              </span>
            </div>

            {!baileysConnected && baileysQr ? (
              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <img
                  alt="WhatsApp QR"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(baileysQr)}`}
                  width={300}
                  height={300}
                  style={{
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                  }}
                />
              </div>
            ) : null}
          </div>
        </>
      )}

    </div>
  );
}
