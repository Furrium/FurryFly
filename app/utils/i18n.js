import React from "react";
import en from '../../locales/en.json';
import zhCN from '../../locales/zh-CN.json';

// Locale bundles are imported explicitly rather than through require.context.
// require.context is a webpack-only API: any module that imported this file became
// unusable outside the renderer bundle, which broke the main-process services and the
// node test harness the moment they needed translateLocale().
//
// The set is small and fixed (see languageDropdownItems), so listing it is both simpler
// and portable. Adding a language means a file, an import here, and a dropdown entry.
const translations = {
  en,
  'zh-CN': zhCN,
};

export const I18nContext = React.createContext({
  t: function() {},
});

export default translations;

export const languageDropdownItems = [
  // Labels are proper nouns in their own language, so they stay literal; only
  // the "Custom JSON" entry describes a feature and is localized at render time.
  { label: 'English', value: 'en-US' },
  { label: '简体中文', value: 'zh-CN' },
  { label: 'Custom JSON', value: 'custom' },
];

// Predefined choices are shared by Settings and the logged-out header.
export const predefinedLanguageItems = languageDropdownItems.filter(item => item.value !== 'custom');
export function normalizeLocale(locale) {
  // Two languages ship; anything else - including locale values left over from an
  // older build - resolves to English rather than to a locale that is no longer here.
  if (locale === 'zh-CN' || /^zh(?:-|$)/i.test(locale || '')) return 'zh-CN';
  return 'en-US';
}

// Interpolate once, after fallback selection. External values may contain %s or $&.
export function translateLocale(locale, customLocale, key, ...values) {
  const language = locale === 'custom' ? 'custom' : normalizeLocale(locale);
  const selected = language === 'custom' ? (customLocale || {}) : (translations[language] || {});
  const root = translations[language.split('-')[0]] || {};
  const template = selected[key] || root[key] || translations.en[key] || `this.context.t(${key})`;
  let index = 0;
  return template.replace(/%s/g, () => index < values.length ? String(values[index++]) : '%s');
}
