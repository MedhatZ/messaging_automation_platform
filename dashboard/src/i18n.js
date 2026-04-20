import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';

const STORAGE_KEY = 'dashboard_lang';

function readStoredLang() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === 'ar' || s === 'en') return s;
  } catch {
    /* ignore */
  }
  return 'en';
}

function applyDocumentDirection(lng) {
  const code = lng?.startsWith('ar') ? 'ar' : 'en';
  document.documentElement.lang = code;
  document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: readStoredLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

applyDocumentDirection(i18n.language);

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng.startsWith('ar') ? 'ar' : 'en');
  } catch {
    /* ignore */
  }
  applyDocumentDirection(lng);
});

export default i18n;
