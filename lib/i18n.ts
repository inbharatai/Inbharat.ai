import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import hi from '../locales/hi.json';
import bn from '../locales/bn.json';
import te from '../locales/te.json';
import mr from '../locales/mr.json';
import ta from '../locales/ta.json';
import gu from '../locales/gu.json';
import kn from '../locales/kn.json';
import ml from '../locales/ml.json';
import or_ from '../locales/or.json';
import as_ from '../locales/as.json';

export const supportedLanguages = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'or', label: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'as', label: 'Assamese', native: 'অসমীয়া' },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      bn: { translation: bn },
      te: { translation: te },
      mr: { translation: mr },
      ta: { translation: ta },
      gu: { translation: gu },
      kn: { translation: kn },
      ml: { translation: ml },
      or: { translation: or_ },
      as: { translation: as_ },
    },
    fallbackLng: 'en',
    supportedLngs: supportedLanguages.map(({ code }) => code),
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'appLanguage',
      caches: ['localStorage'],
    },
  });

/** The selector changes UI resources, not URLs or article language. No localized
 * canonical routes/hreflang are implied. Landing owns its mixed-language shell;
 * other public content routes remain English documents until explicitly localized. */
export function selectedUiLanguage(): string {
  const candidate = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
  return supportedLanguages.some(({ code }) => code === candidate) ? candidate : 'en';
}
export function syncDocumentLanguage(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  document.documentElement.lang = window.location.pathname === '/' ? selectedUiLanguage() : 'en';
}
i18n.on('languageChanged', syncDocumentLanguage);
i18n.on('initialized', syncDocumentLanguage);
syncDocumentLanguage();

export default i18n;
