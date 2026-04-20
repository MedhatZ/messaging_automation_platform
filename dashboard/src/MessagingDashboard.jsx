import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from './api.js';
import { useAuth } from './auth/AuthContext.jsx';
import { LanguageSwitcher } from './components/LanguageSwitcher.jsx';

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

export default function MessagingDashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const tenantId = user?.tenantId ?? '';
  const dir = i18n.language?.startsWith('ar') ? 'rtl' : 'ltr';
  const locale = i18n.language;

  const [view, setView] = useState('leads');

  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(true);

  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(false);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
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

  const tenantReady = Boolean(tenantId && tenantId.length > 10);

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
      setProducts(Array.isArray(data) ? data : []);
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

  useEffect(() => {
    if (!tenantReady) return;
    if (view === 'leads') loadLeads();
    else if (view === 'conversations') loadConversations();
    else if (view === 'products') loadProducts();
    else if (view === 'faq') loadFaqs();
  }, [
    view,
    tenantReady,
    loadLeads,
    loadConversations,
    loadProducts,
    loadFaqs,
  ]);

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
    setMessages([]);
    setMsgLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/conversations/${id}/messages`);
      setMessages(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.message ||
        t('errors.loadMessages');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setSelectedConvId(null);
    } finally {
      setMsgLoading(false);
    }
  }

  function closeConversation() {
    setSelectedConvId(null);
    setMessages([]);
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
        <Link to="/dashboard/whatsapp-accounts" className="tab">
          {t('tabs.waAccounts')}
        </Link>
      </nav>

      {!tenantReady && (
        <div className="banner">{t('banner.noTenant')}</div>
      )}

      {error && <div className="error">{error}</div>}

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
                <button type="button" className="btn-close" onClick={closeConversation}>
                  {t('common.close')}
                </button>
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
                    <th>{t('products.image')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: '#666' }}>
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
                      return (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{Number(row.price).toLocaleString(locale)}</td>
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

    </div>
  );
}
