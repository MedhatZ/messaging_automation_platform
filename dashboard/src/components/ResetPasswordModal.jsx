import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';

/**
 * @param {{ open: boolean; userId: string | null; clientEmail: string; onClose: () => void; onBusyChange?: (userId: string | null) => void }} props
 */
export function ResetPasswordModal({
  open,
  userId,
  clientEmail,
  onClose,
  onBusyChange,
}) {
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!open) {
      setNewPassword('');
      setSubmitting(false);
      setLocalError(null);
      setSuccess(null);
    }
  }, [open]);

  if (!open) return null;

  async function onSubmit(e) {
    e.preventDefault();
    if (!userId) return;
    const pwd = newPassword.trim();
    if (pwd.length < 6) {
      setLocalError(t('errors.tenantPasswordMin'));
      return;
    }
    setSubmitting(true);
    onBusyChange?.(userId);
    setLocalError(null);
    try {
      const { data } = await api.patch(
        `/admin/users/${userId}/reset-password`,
        { newPassword: pwd },
      );
      setSuccess({
        email: data?.email ?? clientEmail,
        newPassword: data?.newPassword ?? pwd,
      });
      setNewPassword('');
    } catch (err) {
      const status = err.response?.status;
      const raw = err.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join(' ') : raw;
      let fallback = t('errors.resetPasswordFailed');
      if (status === 404) fallback = t('errors.resetPasswordNotFound');
      else if (status === 403) fallback = t('errors.resetPasswordForbidden');
      else if (status === 400) fallback = t('errors.resetPasswordBadRequest');
      setLocalError(
        typeof msg === 'string' ? msg : fallback,
      );
    } finally {
      setSubmitting(false);
      onBusyChange?.(null);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-labelledby="reset-password-title"
        onClick={(e) => e.stopPropagation()}
      >
        {!success ? (
          <>
            <h3 id="reset-password-title">{t('admin.resetPasswordTitle')}</h3>
            <p className="modal-muted">
              {t('admin.resetPasswordFor')}: <strong>{clientEmail}</strong>
            </p>
            {localError && <div className="error modal-error">{localError}</div>}
            <form className="modal-form" onSubmit={onSubmit}>
              <label className="field field-wide">
                <span>{t('admin.newPassword')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  maxLength={128}
                  required
                  disabled={submitting}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? t('common.saving') : t('admin.resetPassword')}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h3 id="reset-password-title">
              {t('admin.passwordUpdatedTitle')}
            </h3>
            <p>
              <strong>{t('admin.clientEmail')}:</strong> {success.email}
            </p>
            <p>
              <strong>{t('auth.password')}:</strong>{' '}
              <code>{success.newPassword}</code>
            </p>
            <p className="banner-hint">{t('admin.credentialsHint')}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={onClose}
              >
                {t('common.close')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
