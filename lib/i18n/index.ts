import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import idLocale from './locales/id.json';
import enLocale from './locales/en.json';

const resources = {
  id: { translation: idLocale },
  en: { translation: enLocale },
};

i18n.use(initReactI18next).init({
  resources, lng: 'id', fallbackLng: 'id',
  interpolation: { escapeValue: false },
});

export default i18n;
