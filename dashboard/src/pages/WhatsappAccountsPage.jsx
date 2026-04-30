import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { LanguageSwitcher } from '../components/LanguageSwitcher.jsx';

export default function WhatsappAccountsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const tenantId = user?.tenantId ?? '';
  const dir = i18n.language?.startsWith('ar') ? 'rtl' : 'ltr';

  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
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

  return (
    <div className="app" dir={dir}>
      <header className="app-header">
        <div className="app-header-main">
          <h1>{t('app.title')}</h1>
          <p>ربط واتساب</p>
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
        <span className="tab active">ربط واتساب</span>
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
    </div>
  );
}
