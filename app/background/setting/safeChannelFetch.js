import dns from 'dns';
import net from 'net';
import https from 'https';
import {getLiquiditySpotChannelUrl, normalizeLiquiditySpotHost} from '../../constants/liquiditySpotChannels';

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 10 * 1000;

// Messages raised here cross the IPC boundary and are shown to the user, so they
// carry a stable code. The renderer maps the code to a translated sentence.
function channelError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

export function isPrivateNetworkAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19 || b === 51))
      || (a === 203 && b === 0)
      || a >= 224;
  }

  if (version === 6) {
    const normalized = address.toLowerCase().split('%')[0];
    if (normalized.startsWith('::ffff:')) {
      return isPrivateNetworkAddress(normalized.slice(7));
    }
    return normalized === '::'
      || normalized === '::1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || /^fe[89ab]/.test(normalized)
      || normalized.startsWith('ff');
  }

  return true;
}

async function assertPublicHostname(hostname) {
  if (hostname.toLowerCase() === 'localhost') {
    throw channelError(
      'LIQUIDITY_CHANNEL_PRIVATE_HOST',
      'Local and private Liquidity channel hosts are not allowed.'
    );
  }

  const addresses = await dns.promises.lookup(hostname, {all: true, verbatim: true});
  if (!addresses.length || addresses.some(({address}) => isPrivateNetworkAddress(address))) {
    throw channelError(
      'LIQUIDITY_CHANNEL_PRIVATE_HOST',
      'Local and private Liquidity channel hosts are not allowed.'
    );
  }
}

function createPublicNetworkAgent() {
  return new https.Agent({
    lookup(hostname, options, callback) {
      dns.lookup(hostname, {...options, all: true, verbatim: true}, (error, addresses) => {
        if (error) return callback(error);
        if (!addresses.length || addresses.some(({address}) => isPrivateNetworkAddress(address))) {
          return callback(channelError(
            'LIQUIDITY_CHANNEL_PRIVATE_HOST',
            'Local and private Liquidity channel hosts are not allowed.'
          ));
        }

        const selected = addresses[0];
        if (options.all) return callback(null, addresses);
        return callback(null, selected.address, selected.family);
      });
    },
  });
}

function assertSafeChannelUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw channelError(
      'LIQUIDITY_CHANNEL_INSECURE_URL',
      'Liquidity channels must use HTTPS without embedded credentials.'
    );
  }
  return url;
}

async function readLimitedText(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw channelError('LIQUIDITY_CHANNEL_TOO_LARGE', 'Liquidity channel response is too large.');
  }

  if (!response.body || !response.body[Symbol.asyncIterator]) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw channelError('LIQUIDITY_CHANNEL_TOO_LARGE', 'Liquidity channel response is too large.');
    }
    return text;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_RESPONSE_BYTES) {
      response.body.destroy();
      throw channelError('LIQUIDITY_CHANNEL_TOO_LARGE', 'Liquidity channel response is too large.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function validateChannelDocument(channel) {
  if (!channel || typeof channel !== 'object' || Array.isArray(channel)) {
    throw channelError('LIQUIDITY_CHANNEL_INVALID_DOCUMENT', 'Liquidity channel returned an invalid document.');
  }
  if (channel.name !== undefined && typeof channel.name !== 'string') {
    throw channelError('LIQUIDITY_CHANNEL_INVALID_DOCUMENT', 'Liquidity channel returned an invalid name.');
  }
  if (channel.p2p?.offers !== undefined && !Array.isArray(channel.p2p.offers)) {
    throw channelError('LIQUIDITY_CHANNEL_INVALID_DOCUMENT', 'Liquidity channel returned invalid P2P offers.');
  }
  if (channel.atomic_swaps?.orders !== undefined && !Array.isArray(channel.atomic_swaps.orders)) {
    throw channelError('LIQUIDITY_CHANNEL_INVALID_DOCUMENT', 'Liquidity channel returned invalid atomic swap orders.');
  }
  return channel;
}

export async function fetchLiquidityChannel(host, path = '/api/channel') {
  const normalizedHost = normalizeLiquiditySpotHost(host);
  if (!normalizedHost) {
    throw channelError('LIQUIDITY_CHANNEL_INVALID_HOST', 'Enter a valid Liquidity channel host.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let currentUrl = getLiquiditySpotChannelUrl(normalizedHost, path);

  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const url = assertSafeChannelUrl(currentUrl);
      await assertPublicHostname(url.hostname);

      const response = await fetch(url.href, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {accept: 'application/json'},
        agent: createPublicNetworkAgent(),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects === MAX_REDIRECTS) {
          throw channelError('LIQUIDITY_CHANNEL_TOO_MANY_REDIRECTS', 'Liquidity channel returned too many redirects.');
        }
        currentUrl = new URL(location, url).href;
        continue;
      }

      if (!response.ok) {
        throw channelError(
          'LIQUIDITY_CHANNEL_HTTP_STATUS',
          `Liquidity channel returned HTTP ${response.status}.`,
          {status: response.status}
        );
      }

      const text = await readLimitedText(response);
      let channel;
      try {
        channel = JSON.parse(text);
      } catch (e) {
        throw channelError('LIQUIDITY_CHANNEL_INVALID_JSON', 'Liquidity channel returned invalid JSON.');
      }

      return {
        channel: validateChannelDocument(channel),
        host: normalizedHost,
        url: url.href,
        status: response.status,
      };
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      throw channelError('LIQUIDITY_CHANNEL_TIMEOUT', 'Liquidity channel request timed out.');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
