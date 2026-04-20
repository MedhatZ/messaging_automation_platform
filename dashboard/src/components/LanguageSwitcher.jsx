import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const active = i18n.language?.startsWith('ar') ? 'ar' : 'en';

  return (
    <div
      className="lang-switch"
      role="group"
      aria-label={t('lang.label')}
    >
      <button
        type="button"
        className={active === 'en' ? 'lang-btn active' : 'lang-btn'}
        onClick={() => i18n.changeLanguage('en')}
        aria-pressed={active === 'en'}
      >
        {t('lang.en')}
      </button>
      <button
        type="button"
        className={active === 'ar' ? 'lang-btn active' : 'lang-btn'}
        onClick={() => i18n.changeLanguage('ar')}
        aria-pressed={active === 'ar'}
      >
        {t('lang.ar')}
      </button>
    </div>
  );
}
