import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from './api.js';
import { useAuth } from './auth/AuthContext.jsx';
import { LanguageSwitcher } from './components/LanguageSwitcher.jsx';
import { ResetPasswordModal } from './components/ResetPasswordModal.jsx';

function formatDate(iso, locale) {
  if (!iso) return '\u2014';
  try {
    const loc = locale?.startsWith('ar') ? 'ar' : 'en';
    return new Date(iso).toLocaleString(loc);
  } catch {
    return iso;
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const dir = i18n.language?.startsWith('ar') ? 'rtl' : 'ltr';
  const locale = i18n.language;
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [tenants, setTenants] = useState([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [tenantForm, setTenantForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [savingTenant, setSavingTenant] = useState(false);
  const [busyAdminTenantId, setBusyAdminTenantId] = useState(null);
  const [error, setError] = useState(null);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [resetModal, setResetModal] = useState(null);
  const [resettingUserId, setResettingUserId] = useState(null);

  const dash = t('common.empty');

  const loadTenants = useCallback(async () => {
    setError(null);
    setTenantsLoading(true);
    try {
      const { data } = await api.get('/admin/tenants');
      setTenants(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg =
        e.response?.data?.message || e.message || t('errors.loadTenants');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setTenants([]);
    } finally {
      setTenantsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  async function submitTenant(e) {
    e.preventDefault();
    const name = tenantForm.name.trim();
    const email = tenantForm.email.trim();
    const password = tenantForm.password;
    if (!name) {
      setError(t('errors.tenantNameRequired'));
      return;
    }
    if (!email || !isValidEmail(email)) {
      setError(t('errors.tenantEmailRequired'));
      return;
    }
    if (!password || password.length < 6) {
      setError(t('errors.tenantPasswordMin'));
      return;
    }
    setSavingTenant(true);
    setError(null);
    setCreatedCredentials(null);
    try {
      const { data } = await api.post('/admin/tenants', {
        name,
        email,
        password,
      });
      setTenantForm({ name: '', email: '', password: '' });
      if (data?.userEmail && data?.password != null) {
        setCreatedCredentials({
          tenantId: data.tenantId,
          userEmail: data.userEmail,
          password: data.password,
        });
      }
      await loadTenants();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        t('errors.createTenantFailed');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSavingTenant(false);
    }
  }

  async function toggleTenantActive(id) {
    setBusyAdminTenantId(id);
    setError(null);
    try {
      await api.patch(`/admin/tenants/${id}/toggle`);
      await loadTenants();
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.message ||
        t('errors.toggleTenantFailed');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setBusyAdminTenantId(null);
    }
  }

  async function extendTenantSubscription(id) {
    setBusyAdminTenantId(id);
    setError(null);
    try {
      await api.patch(`/admin/tenants/${id}/extend`);
      await loadTenants();
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.message ||
        t('errors.extendTenantFailed');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setBusyAdminTenantId(null);
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
          <h1>{t('admin.title')}</h1>
          <p>{t('admin.subtitle')}</p>
        </div>
        <div className="app-header-actions">
          <LanguageSwitcher />
          <button type="button" className="btn-logout" onClick={handleLogout}>
            {t('auth.logout')}
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <ResetPasswordModal
        open={Boolean(resetModal)}
        userId={resetModal?.userId ?? null}
        clientEmail={resetModal?.email ?? ''}
        onClose={() => setResetModal(null)}
        onBusyChange={setResettingUserId}
      />

      {createdCredentials && (
        <div className="banner banner-success" role="status">
          <p className="banner-title">{t('admin.credentialsTitle')}</p>
          <p>
            <strong>{t('admin.clientEmail')}:</strong>{' '}
            {createdCredentials.userEmail}
          </p>
          <p>
            <strong>{t('auth.password')}:</strong>{' '}
            <code>{createdCredentials.password}</code>
          </p>
          <p className="banner-hint">{t('admin.credentialsHint')}</p>
          <button
            type="button"
            className="btn-dismiss"
            onClick={() => setCreatedCredentials(null)}
          >
            {t('common.close')}
          </button>
        </div>
      )}

      <h2 className="section-title">{t('admin.title')}</h2>

      <form className="product-form" onSubmit={submitTenant}>
        <h3 className="form-title">{t('admin.addTitle')}</h3>
        <div className="form-grid">
          <label className="field">
            <span>{t('admin.name')}</span>
            <input
              type="text"
              value={tenantForm.name}
              onChange={(e) =>
                setTenantForm((f) => ({ ...f, name: e.target.value }))
              }
              maxLength={500}
              required
            />
          </label>
          <label className="field">
            <span>{t('admin.clientEmail')}</span>
            <input
              type="email"
              value={tenantForm.email}
              onChange={(e) =>
                setTenantForm((f) => ({ ...f, email: e.target.value }))
              }
              maxLength={320}
              required
            />
          </label>
          <label className="field">
            <span>{t('admin.clientPassword')}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={tenantForm.password}
              onChange={(e) =>
                setTenantForm((f) => ({ ...f, password: e.target.value }))
              }
              minLength={6}
              maxLength={128}
              required
            />
          </label>
        </div>
        <button type="submit" className="btn-primary" disabled={savingTenant}>
          {savingTenant ? t('common.saving') : t('admin.create')}
        </button>
      </form>

      {tenantsLoading ? (
        <div className="loading">{t('loading.generic')}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('admin.name')}</th>
                <th>{t('admin.email')}</th>
                <th>{t('admin.status')}</th>
                <th>{t('admin.expiry')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#666' }}>
                    {t('admin.empty')}
                  </td>
                </tr>
              ) : (
                tenants.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name || dash}</td>
                    <td>{row.email || dash}</td>
                    <td>
                      <span
                        className={
                          row.isActive
                            ? 'tenant-pill tenant-pill-on'
                            : 'tenant-pill tenant-pill-off'
                        }
                      >
                        {row.isActive ? t('admin.active') : t('admin.inactive')}
                      </span>
                    </td>
                    <td>{formatDate(row.subscriptionEnd, locale)}</td>
                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          className="btn-edit"
                          disabled={busyAdminTenantId === row.id}
                          onClick={() => toggleTenantActive(row.id)}
                        >
                          {t('admin.toggle')}
                        </button>
                        <button
                          type="button"
                          className="btn-contacted"
                          disabled={busyAdminTenantId === row.id}
                          onClick={() => extendTenantSubscription(row.id)}
                        >
                          {t('admin.extend')}
                        </button>
                        <button
                          type="button"
                          className="btn-reset-password"
                          disabled={
                            !row.userId ||
                            busyAdminTenantId === row.id ||
                            resettingUserId === row.userId
                          }
                          onClick={() =>
                            setResetModal({
                              userId: row.userId,
                              email: row.email || dash,
                            })
                          }
                        >
                          {t('admin.resetPassword')}
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
    </div>
  );
}
