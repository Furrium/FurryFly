import { del, get, put } from '../db/service';
import { app } from "electron";
import {
  normalizeLiquiditySpotHost,
} from '../../constants/liquiditySpotChannels';
import {fetchLiquidityChannel} from './safeChannelFetch';
import BRAND from '../../constants/branding';

const EXPLORER = 'setting/explorer';
const LOCALE = 'setting/locale';
const CUSTOM_LOCALE = 'setting/customLocale';
const THEME = 'setting/theme';
const SHOW_USD_VALUE = 'setting/showUsdValue';
// The product ships one theme. Stored values from older builds (or a hand-edited
  // settings file) are still accepted and normalised rather than rejected, so a
  // leftover 'light' or 'neon' cannot leave the app with no theme at all.
const VALID_THEMES = new Set(['dark']);
const LEGACY_THEMES = new Set(['light', 'dark', 'neon']);
const DEFAULT_THEME = 'dark';


export async function getExplorer() {
  const explorer = await get(EXPLORER);
  return explorer;
}

export async function setExplorer(explorer) {
  return await put(EXPLORER, explorer);
}

export async function getLocale() {
  const locale = await get(LOCALE);

  if (locale) return locale;

  return app.getLocale();
}

export async function getCustomLocale() {
  return await get(CUSTOM_LOCALE);
}

export async function setLocale(locale) {
  await put(CUSTOM_LOCALE, '');
  return await put(LOCALE, locale);
}

export async function setCustomLocale(json) {
  await put(LOCALE, 'custom');
  return await put(CUSTOM_LOCALE, JSON.stringify(json));
}

export async function getTheme() {
  const theme = await get(THEME);
  return VALID_THEMES.has(theme) ? theme : DEFAULT_THEME;
}

export async function setTheme(theme) {
  // Anything that was ever a theme collapses to the only one there is.
  const requested = LEGACY_THEMES.has(theme) ? theme : DEFAULT_THEME;
  const nextTheme = VALID_THEMES.has(requested) ? requested : DEFAULT_THEME;
  await put(THEME, nextTheme);
  return nextTheme;
}

export async function getShowUsdValue() {
  const showUsdValue = await get(SHOW_USD_VALUE);
  return showUsdValue !== false;
}

export async function setShowUsdValue(showUsdValue) {
  const nextShowUsdValue = Boolean(showUsdValue);
  await put(SHOW_USD_VALUE, nextShowUsdValue);
  return nextShowUsdValue;
}

export async function getLatestRelease() {
  // Refuse to offer another product as an update: linking a user to a foreign
  // installer is worse than showing no update at all.
  if (!BRAND.updateRepo) return null;
  try {
    const releases = await (
      await fetch(
        `https://api.github.com/repos/${BRAND.updateRepo}/releases`
      )
    ).json();
    const latest = releases.filter(r => !r.draft && !r.prerelease)[0];
    return latest;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function validateLiquidityChannelHost(host) {
  const normalizedHost = normalizeLiquiditySpotHost(host);
  if (!normalizedHost) {
    return {
      ok: false,
      host: '',
      url: '',
      error: 'Enter a valid Liquidity channel host.',
      errorCode: 'LIQUIDITY_CHANNEL_INVALID_HOST',
    };
  }

  try {
    const result = await fetchLiquidityChannel(normalizedHost);
    return {
      ok: true,
      host: normalizedHost,
      url: result.url,
      status: result.status,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      host: normalizedHost,
      url: '',
      status: e.status,
      error: e.message,
      errorCode: e.code || null,
    };
  }
}

export async function getLiquidityChannel(host) {
  const result = await fetchLiquidityChannel(host);
  return result.channel;
}

const sName = 'Setting';
const methods = {
  getExplorer,
  setExplorer,
  getLocale,
  setLocale,
  getCustomLocale,
  setCustomLocale,
  getTheme,
  setTheme,
  getShowUsdValue,
  setShowUsdValue,
  getLatestRelease,
  validateLiquidityChannelHost,
  getLiquidityChannel,
};

export async function start(server) {
  server.withService(sName, methods);
}
