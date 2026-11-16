import React from 'react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import i18n, { selectedUiLanguage } from './i18n';
import en from '../locales/en.json';

/** Legacy string-valued UI props remain strings. At the render boundary, label
 * the actual resource language, not merely the selector's language. English
 * resource matches (including intentional fallback) take precedence. */
export function languageOfText(value: string): string {
  if (Object.values(en).includes(value) || !/[\u0900-\u0dff]/.test(value)) return 'en';
  const language = selectedUiLanguage();
  const resource = i18n.getResourceBundle(language, 'translation');
  if (resource && Object.values(resource).includes(value)) return language;
  return 'en';
}

export function localized(value: string): React.ReactElement {
  return <span lang={languageOfText(value)}>{value}</span>;
}

// No browser detector here: rendering an English-only island must never change
// the stored user selection. This instance shares no mutable language state.
const english = createInstance();
void english.init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false }, initImmediate: false });
export function EnglishOnly({ children }: { children: React.ReactNode }) {
  return <div lang="en" data-english-only><I18nextProvider i18n={english}>{children}</I18nextProvider></div>;
}
