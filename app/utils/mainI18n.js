// Locale for background-process messages.
//
// Background services (wallet, node, logger) throw Errors whose `message` is put
// straight into the UI by the IPC layer, so they cannot live in en.json alone:
// the renderer never sees a key for them. Each such Error carries `messageKey`
// (+ `messageArgs`) and the English text stays on the Error as the fallback.
// `localizeMessage` copies the text for the selected language onto `message`
// without changing the Error's identity, `code` or anything tests assert on.
//
// The module is deliberately dependency-free: it only needs the translation
// bundles, which means tests can require it without starting Electron or the
// settings database.
import translations from './i18n';

// Mirrors `normalizeLocale` in ./i18n, which is not import-safe outside the
// renderer bundle (it pulls in React and every locale JSON via require.context).
function normalizeLocale(locale) {
  if (locale === 'zh-CN' || /^zh(?:-|$)/i.test(locale || '')) return 'zh-CN';
  return 'en-US';
}

// Background code has no React context, so it reads the saved preference. The
// settings service is required lazily: it opens the app's data store on first
// use, and a locale lookup must never be able to break a wallet operation.
//
// `__non_webpack_require__` is load-bearing. This module is reachable from the
// renderer (ipc.js is shared, and the renderer imports it through InteractiveFixture),
// and webpack follows a plain require() even from inside a function - which dragged the
// settings service, and with it hsd and node's crypto, into the renderer bundle where
// `crypto` has no fallback and the build fails. This tells webpack to leave the call
// alone so it stays a real runtime require in the main process.
async function savedLocale() {
  try {
    const loadSettings = typeof __non_webpack_require__ === 'function'
      ? __non_webpack_require__
      : require;
    const settings = loadSettings('../background/setting/service');
    const saved = await settings.getLocale();
    if (saved === 'custom') {
      const raw = await settings.getCustomLocale();
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return {locale: 'custom', customLocale: parsed};
      }
    }
    return {locale: normalizeLocale(saved), customLocale: null};
  } catch (_) {
    // An unreadable preference must fall back to English, never to a throw.
    return {locale: 'en-US', customLocale: null};
  }
}

function render({locale, customLocale}, key, args) {
  const language = locale === 'custom' ? 'custom' : normalizeLocale(locale);
  const selected = language === 'custom' ? (customLocale || {}) : (translations[language] || {});
  const template = selected[key] || translations.en[key];
  if (typeof template !== 'string') return null;
  let index = 0;
  return template.replace(/%s/g, () => index < args.length ? String(args[index++]) : '%s');
}

/**
 * Translate and attach a message to each keyed Error in `errors`.
 * Errors without a `messageKey` are returned untouched.
 */
export async function localizeMessages(...errors) {
  const keyed = errors.filter(error => error && typeof error.messageKey === 'string');
  if (!keyed.length) return errors;
  const preference = await savedLocale();
  for (const error of keyed) {
    const text = renderError(preference, error);
    if (text !== null) error.message = text;
  }
  return errors;
}

// Mirrors basketScopeErrorText in ./basketScope, which cannot be imported here: it pulls
// in hsd, and this module is reachable from the renderer bundle, where hsd's node
// builtins have no fallback. A keyed scope error wraps a reason
// ("<reason> No transaction was sent..."), so the reason is rendered first and passed in;
// using the wrapper key alone would leave its %s unfilled.
function renderError(preference, error) {
  if (typeof error.reasonKey === 'string') {
    const reasonArgs = (error.reasonArgs || []).map(value => `${value ?? ''}`);
    const reason = render(preference, error.reasonKey, reasonArgs);
    return render(preference, error.messageKey, [reason === null ? '' : reason]);
  }
  return render(preference, error.messageKey, error.messageArgs || []);
}

export default localizeMessages;
