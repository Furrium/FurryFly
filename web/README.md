# TRANSFUR browser wallet — Regtest preview

This is a separate browser-only client. It does not start or need Electron,
never uses mainnet, and has not been audited for real funds. **Never paste a real
wallet's recovery phrase into this preview.**

## Run locally

Use Node.js 22 and a modern browser. Install the project's pinned JavaScript
packages without desktop native build scripts:

```sh
npm ci --ignore-scripts
npm run build:web-wallet
npm run start:web-wallet
```

Open `http://127.0.0.1:8080`. Create a wallet and save its disposable recovery
phrase. Copy the `rs1…` receive address and type the following **in the running
server's terminal**, not in the web address bar:

```text
fund <your-rs1-address>
```

Refresh the wallet, enter another regtest address and an amount, check the
recipient and fee, then confirm. Type `mine` in the terminal to confirm the
transaction. Press Ctrl+C to stop. The test chain is **in memory** and resets
when stopped; the encrypted browser wallet survives reloads and restarts at
exactly the same origin. `TRANSFUR_WEB_PORT` changes the port, which also
changes the browser's storage origin. Never open the preview on a public bind.

If public Git URLs resolve via SSH and you cannot reach GitHub SSH, run the
install with a per-command HTTPS rewrite (POSIX shell):

```sh
GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=url.https://github.com/.insteadOf \
  GIT_CONFIG_VALUE_0=ssh://git@github.com/ npm ci --ignore-scripts
```

## Serverless integration (not deployed)

Serve the generated static files in `web/dist/` over HTTPS. Route exactly
`/api/status`, `/api/coins` and `/api/transactions` to the same-origin **Node.js**
serverless function. This repo ships a Fetch `Request` → `Response` adapter, not
a deployment for a specific provider:

```js
// Set NODE_BACKEND=js in the function environment before importing hsd.
const {createHandler} = require('./web/serverless/handler.cjs');
const handle = createHandler({env: process.env});
// In your platform's request callback:
// return handle(request);
```

| Server-only variable | Meaning |
| --- | --- |
| `NODE_BACKEND` | Set to `js`; no native addons required. |
| `TRANSFUR_WEB_ORIGIN` | Exact HTTPS origin serving the wallet, without a path. |
| `TRANSFUR_HSD_URL` | Separate fixed HTTPS origin of the regtest hsd full node. |
| `TRANSFUR_HSD_API_KEY` | The upstream hsd Basic Auth password; put in function secrets only. |

A **long-running** hsd full node with `index-address=true` is still required.
Serverless replaces the HTTP application process, not the chain or index. Run
hsd behind an authenticated/private HTTPS ingress and give only the functions
network access. Endpoint input is bounded; there is no generic RPC proxy, wallet
API, miner, faucet, CORS allowance, or API-key delivery to the frontend. The
adapter only reports success after observing the exact signed transaction in
the upstream node. If the response is lost or acceptance cannot be verified,
check the transaction ID before resubmitting.

The generated `_headers` is an example for hosts that support that syntax.
On other hosts, apply equivalent headers yourself: same-origin assets and API,
no framing, no caching for this preview, and `connect-src 'none'` on the signer
worker. Use HTTPS with standard certificate validation and add platform rate
limits before hosting for anyone else. This version has not been deployed.

## Wallet scope and limits

- Browser-generated 12-word English BIP39 recovery phrase; one local vault per
  browser origin, using PBKDF2-SHA-256 (600,000 iterations) and AES-256-GCM.
  IndexedDB stores encrypted bytes and the salt/IV, not the cleartext phrase.
- Signing and key derivation are in a network-disabled Web Worker. A transfer
  is signed only after confirming the reviewed recipient, amount and fee. Locking
  terminates the worker; this does not guarantee memory zeroization in JavaScript.
  Anyone controlling the app origin or browser can still compromise its wallet.
- Only regtest payments (`NONE` outputs), one fixed receive and one change
  address (BIP44 account 0, index 0), and confirmed/mature inputs. No gap scan,
  old account discovery, history index, Ledger, auctions or mainnet support.
- A trusted index provides balances and coin metadata; this client is not an
  SPV verifier. The server sees public queried addresses and signed transactions,
  not the phrase or password. Clearing browser data can remove the local vault;
  the phrase is the only recovery method.

## Verify

```sh
npm run test:web-wallet
npm run build:web-wallet
npm run test:web-wallet:browser
```

The browser test uses Playwright and Chromium, both test-only. Install
Playwright in a separate test-tools directory and set `TRANSFUR_PLAYWRIGHT_MODULE`
to its absolute `node_modules/playwright` path, or make it resolvable from
this checkout. Install Playwright's Chromium for the default launch, or set
`TRANSFUR_BROWSER_CHANNEL=chrome` to use an existing Google Chrome. The test
starts its own regtest with a random port, blocks non-local requests, checks the
320px layout and the native confirmation dialog's keyboard behavior, mines a
browser-signed payment, and checks vault persistence and recovery.

## Web platform guidance

The transaction confirmation uses the native [`<dialog>` pattern](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/ui-components/dialog.md)
for Escape, native focus containment and no background interaction. The wallet
layout follows [form-factor adaptation](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/user-experience/form-factor-adaptation.md):
container queries, visible keyboard focus, wrapping addresses and 44px coarse
pointer controls. The signer loads on demand; the initial page does not load
hsd or a crypto library in the main thread.
