import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';
import { LanguageSwitcher } from '../components/LanguageSwitcher.jsx';

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const dir = i18n.language?.startsWith('ar') ? 'rtl' : 'ltr';
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.role) return;
    if (user.role === 'ADMIN') {
      navigate('/admin', { replace: true });
    } else if (user.role === 'CLIENT') {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = await login(email.trim(), password);
      const role = payload?.role;
      if (role === 'ADMIN') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        t('auth.loginError');
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app login-page" dir={dir}>
      <header className="app-header login-header">
        <div className="app-header-main">
          <h1>{t('auth.loginTitle')}</h1>
        </div>
        <LanguageSwitcher />
      </header>

      {error && <div className="error">{error}</div>}

      <form className="product-form login-form" onSubmit={onSubmit}>
        <div className="form-grid">
          <label className="field field-wide">
            <span>{t('auth.email')}</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field field-wide">
            <span>{t('auth.password')}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        </div>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? t('auth.loggingIn') : t('auth.submit')}
        </button>
      </form>
    </div>
  );
}
