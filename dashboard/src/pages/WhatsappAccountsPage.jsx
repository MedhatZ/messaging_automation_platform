import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { LanguageSwitcher } from '../components/LanguageSwitcher.jsx';

function formatDate(iso, locale) {
  if (!iso) return '\u2014';
  try {
    const loc = locale?.startsWith('ar') ? 'ar' : 'en';
    return new Date(iso).toLocaleString(loc);
  } catch {
    return iso;
  }
}

function formatTokenMask(last4) {
  if (!last4 || String(last4).length < 1) return '\u2014';
  const s = String(last4).replace(/\s/g, '');
  const tail = s.length >= 4 ? s.slice(-4) : s;
  return `****${tail}`;
}

function statusBadgeClass(status) {
  const s = (status ?? '').toLowerCase();
  if (s === 'active') return 'badge badge-active';
  if (s === 'disabled' || s === 'inactive') return 'badge badge-disabled';
  return 'badge badge-muted';
}

const emptyForm = {
  metaPhoneNumberId: '',
  metaWabaId: '',
  displayPhoneNumber: '',
  accessToken: '',
};

export default function WhatsappAccountsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const tenantId = user?.tenantId ?? '';
  const dir = i18n.language?.startsWith('ar') ? 'rtl' : 'ltr';
  const locale = i18n.language;
  const dash = t('common.empty');

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [savingCreate, setSavingCreate] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [toast, setToast] = useState(null);
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [baileysStatus, setBaileysStatus] = useState({
    status: 'disconnected',
    qr: null,
  });
  const [baileysBusy, setBaileysBusy] = useState(false);

  const tenantReady = Boolean(tenantId && tenantId.length > 10);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const loadAccounts = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.get('/whatsapp-accounts');
      setAccounts(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.message ||
        t('errors.loadWaAccounts');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!tenantReady) return;
    void loadAccounts();
  }, [tenantReady, loadAccounts]);

  const loadBaileys = useCallback(async () => {
    if (!tenantReady) return;
    try {
      const { data } = await api.get('/baileys/qr');
      setBaileysStatus({
        status: data?.status ?? 'disconnected',
        qr: data?.qr ?? null,
      });
    } catch {
      // ignore (Baileys might be disabled server-side)
    }
  }, [tenantReady]);

  useEffect(() => {
    void loadBaileys();
  }, [loadBaileys]);

  useEffect(() => {
    if (!tenantReady) return undefined;
    if (baileysStatus?.status !== 'connecting') return undefined;
    const id = setInterval(() => void loadBaileys(), 2500);
    return () => clearInterval(id);
  }, [tenantReady, baileysStatus?.status, loadBaileys]);

  async function connectBaileys() {
    setBaileysBusy(true);
    setError(null);
    try {
      const { data } = await api.post('/baileys/connect');
      setBaileysStatus({
        status: data?.status ?? 'connecting',
        qr: data?.qr ?? null,
      });
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Failed to start Baileys connection';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setBaileysBusy(false);
    }
  }

  async function disconnectBaileys() {
    setBaileysBusy(true);
    setError(null);
    try {
      const { data } = await api.post('/baileys/disconnect');
      setBaileysStatus({
        status: data?.status ?? 'disconnected',
        qr: data?.qr ?? null,
      });
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Failed to disconnect Baileys';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setBaileysBusy(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  function normalizeEditStatus(status) {
    const s = (status ?? '').toLowerCase();
    if (s === 'active') return 'active';
    return 'disabled';
  }

  async function submitCreate(e) {
    e.preventDefault();
    const metaPhoneNumberId = createForm.metaPhoneNumberId.trim();
    const accessToken = createForm.accessToken.trim();
    if (!metaPhoneNumberId || !accessToken) {
      setError(t('waAccounts.requiredFields'));
      return;
    }
    setSavingCreate(true);
    setError(null);
    try {
      await api.post('/whatsapp-accounts', {
        metaPhoneNumberId,
        accessToken,
        metaAppSecret: metaAppSecret.trim() || undefined,
        ...(createForm.metaWabaId.trim()
          ? { metaWabaId: createForm.metaWabaId.trim() }
          : {}),
        ...(createForm.displayPhoneNumber.trim()
          ? { displayPhoneNumber: createForm.displayPhoneNumber.trim() }
          : {}),
      });
      setCreateForm(emptyForm);
      setMetaAppSecret('');
      await loadAccounts();
      setToast({ type: 'success', text: t('common.save') });
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        t('errors.createWaAccount');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSavingCreate(false);
    }
  }

  function openEdit(row) {
    setError(null);
    setEditRow({
      id: row.id,
      metaPhoneNumberId: row.metaPhoneNumberId ?? '',
      displayPhoneNumber: row.displayPhoneNumber ?? '',
      status: normalizeEditStatus(row.status),
      accessToken: '',
    });
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setError(null);
    const payload = {
      metaPhoneNumberId: editRow.metaPhoneNumberId.trim(),
      displayPhoneNumber: editRow.displayPhoneNumber.trim(),
      status: editRow.status,
    };
    if (editRow.accessToken.trim()) {
      payload.accessToken = editRow.accessToken.trim();
    }
    try {
      await api.patch(`/whatsapp-accounts/${editRow.id}`, payload);
      setEditRow(null);
      await loadAccounts();
      setToast({ type: 'success', text: t('common.save') });
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        t('errors.updateWaAccount');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeAccount(id) {
    if (!window.confirm(t('waAccounts.confirmDelete'))) return;
    setBusyId(id);
    setError(null);
    try {
      await api.delete(`/whatsapp-accounts/${id}`);
      await loadAccounts();
      setToast({ type: 'success', text: t('common.delete') });
    } catch (e) {
      const msg =
        e.response?.data?.message || e.message || t('errors.deleteFailed');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setBusyId(null);
    }
  }

  async function testConnection(id) {
    setBusyId(id);
    setError(null);
    try {
      const { data } = await api.post(`/whatsapp-accounts/${id}/test`);
      if (data?.ok === true) {
        setToast({ type: 'success', text: t('waAccounts.toastSent') });
      } else {
        const errText =
          typeof data?.error === 'string'
            ? data.error
            : t('waAccounts.toastTestFailed');
        setToast({ type: 'error', text: errText });
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        t('errors.testWaAccount');
      setToast({
        type: 'error',
        text: typeof msg === 'string' ? msg : JSON.stringify(msg),
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app" dir={dir}>
      <header className="app-header">
        <div className="app-header-main">
          <h1>{t('app.title')}</h1>
          <p>{t('waAccounts.subtitle')}</p>
        </div>
        <div className="app-header-actions">
          <LanguageSwitcher />
          <button type="button" className="btn-logout" onClick={handleLogout}>
            {t('auth.logout')}
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label={t('aria.mainNav')}>
        <Link to="/dashboard" className="tab">
          {t('waAccounts.backToDashboard')}
        </Link>
        <span className="tab active">{t('waAccounts.title')}</span>
      </nav>

      {!tenantReady && (
        <div className="banner">{t('banner.noTenant')}</div>
      )}

      {toast && (
        <div
          className={
            toast.type === 'success' ? 'toast toast-success' : 'toast toast-error'
          }
          role="status"
        >
          {toast.text}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <h2 className="section-title">WhatsApp QR (Baileys)</h2>
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ marginBottom: 8, color: '#666' }}>
              Status: <span className="mono">{baileysStatus?.status ?? '—'}</span>
            </div>
            <div className="actions actions-wrap">
              <button
                type="button"
                className="btn-primary"
                onClick={connectBaileys}
                disabled={!tenantReady || baileysBusy}
              >
                {baileysBusy ? '...' : 'Connect / Show QR'}
              </button>
              <button
                type="button"
                className="btn-delete"
                onClick={disconnectBaileys}
                disabled={!tenantReady || baileysBusy}
              >
                Disconnect
              </button>
              <button
                type="button"
                className="btn-edit"
                onClick={() => void loadBaileys()}
                disabled={!tenantReady || baileysBusy}
              >
                Refresh
              </button>
            </div>
            <p className="field-hint" style={{ marginTop: 10 }}>
              امسح الـ QR من WhatsApp على الموبايل: Linked devices → Link a device.
            </p>
          </div>

          <div style={{ minWidth: 220 }}>
            {baileysStatus?.qr ? (
              <img
                alt="WhatsApp QR"
                style={{
                  width: 220,
                  height: 220,
                  borderRadius: 12,
                  background: '#fff',
                  border: '1px solid #e6e6e6',
                }}
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  baileysStatus.qr,
                )}`}
              />
            ) : (
              <div
                style={{
                  width: 220,
                  height: 220,
                  borderRadius: 12,
                  border: '1px dashed #ddd',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#777',
                }}
              >
                No QR
              </div>
            )}
          </div>
        </div>
      </div>

      <h2 className="section-title">{t('waAccounts.title')}</h2>

      <form className="product-form" onSubmit={submitCreate}>
        <h3 className="form-title">{t('waAccounts.addTitle')}</h3>
        <div className="form-grid">
          <label className="field field-wide">
            <span>{t('waAccounts.metaPhoneNumberId')}</span>
            <input
              type="text"
              value={createForm.metaPhoneNumberId}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  metaPhoneNumberId: e.target.value,
                }))
              }
              maxLength={64}
              required
            />
          </label>
          <label className="field field-wide">
            <span>{t('waAccounts.accessToken')}</span>
            <input
              type="password"
              autoComplete="off"
              value={createForm.accessToken}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, accessToken: e.target.value }))
              }
              required
            />
          </label>
          <label className="field">
            <span>{t('waAccounts.displayPhoneNumber')}</span>
            <input
              type="text"
              value={createForm.displayPhoneNumber}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  displayPhoneNumber: e.target.value,
                }))
              }
              maxLength={32}
            />
          </label>
          <label className="field field-wide">
            <span>Meta App Secret (اختياري)</span>
            <input
              type="password"
              value={metaAppSecret}
              onChange={(e) => setMetaAppSecret(e.target.value)}
              placeholder="سر تطبيق Meta لتوثيق الـ Webhook"
            />
          </label>
          <label className="field">
            <span>{t('waAccounts.metaWabaId')}</span>
            <input
              type="text"
              value={createForm.metaWabaId}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, metaWabaId: e.target.value }))
              }
              maxLength={64}
            />
          </label>
        </div>
        <button
          type="submit"
          className="btn-primary"
          disabled={savingCreate || !tenantReady}
        >
          {savingCreate ? t('common.saving') : t('waAccounts.add')}
        </button>
      </form>

      {loading ? (
        <div className="loading">{t('loading.generic')}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('waAccounts.displayPhoneNumber')}</th>
                <th>{t('waAccounts.metaPhoneNumberId')}</th>
                <th>{t('waAccounts.tokenPreview')}</th>
                <th>{t('waAccounts.status')}</th>
                <th>{t('waAccounts.createdAt')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: '#666' }}>
                    {t('waAccounts.empty')}
                  </td>
                </tr>
              ) : (
                accounts.map((row) => (
                  <tr key={row.id}>
                    <td>{row.displayPhoneNumber ?? dash}</td>
                    <td className="cell-clip mono" title={row.metaPhoneNumberId}>
                      {row.metaPhoneNumberId}
                    </td>
                    <td className="mono">{formatTokenMask(row.accessTokenLast4)}</td>
                    <td>
                      <span className={statusBadgeClass(row.status)}>
                        {row.status ?? dash}
                      </span>
                    </td>
                    <td>{formatDate(row.createdAt, locale)}</td>
                    <td>
                      <div className="actions actions-wrap">
                        <button
                          type="button"
                          className="btn-test"
                          disabled={busyId === row.id}
                          onClick={() => testConnection(row.id)}
                        >
                          {t('waAccounts.testConnection')}
                        </button>
                        <button
                          type="button"
                          className="btn-edit"
                          disabled={busyId === row.id}
                          onClick={() => openEdit(row)}
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          type="button"
                          className="btn-delete"
                          disabled={busyId === row.id}
                          onClick={() => removeAccount(row.id)}
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

      {editRow && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingEdit) {
              setEditRow(null);
            }
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wa-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="wa-edit-title">{t('waAccounts.editTitle')}</h3>
            <p className="field-hint">{t('waAccounts.editHint')}</p>
            <form onSubmit={submitEdit}>
              <div className="form-grid modal-form">
                <label className="field field-wide">
                  <span>{t('waAccounts.metaPhoneNumberId')}</span>
                  <input
                    type="text"
                    value={editRow.metaPhoneNumberId}
                    onChange={(e) =>
                      setEditRow((r) =>
                        r ? { ...r, metaPhoneNumberId: e.target.value } : r,
                      )
                    }
                    maxLength={64}
                    required
                  />
                </label>
                <label className="field field-wide">
                  <span>{t('waAccounts.accessTokenNew')}</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={editRow.accessToken}
                    onChange={(e) =>
                      setEditRow((r) =>
                        r ? { ...r, accessToken: e.target.value } : r,
                      )
                    }
                    placeholder={t('waAccounts.accessTokenPlaceholder')}
                  />
                </label>
                <label className="field field-wide">
                  <span>{t('waAccounts.displayPhoneNumber')}</span>
                  <input
                    type="text"
                    value={editRow.displayPhoneNumber}
                    onChange={(e) =>
                      setEditRow((r) =>
                        r ? { ...r, displayPhoneNumber: e.target.value } : r,
                      )
                    }
                    maxLength={32}
                  />
                </label>
                <label className="field">
                  <span>{t('waAccounts.status')}</span>
                  <select
                    value={editRow.status}
                    onChange={(e) =>
                      setEditRow((r) =>
                        r ? { ...r, status: e.target.value } : r,
                      )
                    }
                  >
                    <option value="active">{t('waAccounts.statusActive')}</option>
                    <option value="disabled">
                      {t('waAccounts.statusDisabled')}
                    </option>
                  </select>
                </label>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => !savingEdit && setEditRow(null)}
                  disabled={savingEdit}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingEdit}
                >
                  {savingEdit ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
