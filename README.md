# FurryFly: a Handshake wallet and full node for Windows

FurryFly is a **Windows-only** desktop wallet for [Handshake](https://handshake.org) with an
integrated full node. It is a customized build of
[Bob Wallet](https://github.com/shadstoneofficial/bob-wallet).

**Status:** early development. Treat it as beta software and use it at your own risk.

## What this fork changes

- **Windows only.** The macOS and Linux packaging targets are gone, along with their signing,
  notarization and CI workflows. Only a Windows x64 `.msi` is produced.
- **Its own local ports.** The node, wallet and DNS resolver listen at hsd's base ports shifted
  by 3000, so FurryFly coexists with an installed Bob LearnHNS (which sits at base+1000) instead
  of failing to bind.
- **Its own product identity.** App id `com.furryfly.wallet`, URL scheme `furryfly://`, and all
  wallet, chain and hsd data under `%APPDATA%\FurryFly`. FurryFly therefore installs and runs
  beside Bob Wallet instead of sharing a profile with it.
- **No inherited telemetry or update feed.** Crash reporting and the GitHub release check are
  both off by default. The inherited values pointed at the upstream project's Sentry project and
  release feed, which would have sent this build's crash reports to a third party and offered a
  different product as an "update". Enabling either is a one-line change in
  `app/constants/branding.js` once FurryFly has its own repository and Sentry project.
- **Explicit native rebuild.** electron-builder's automatic rebuild is disabled;
  `scripts/rebuild-native.js` compiles the six native modules against Electron's ABI and leaves
  out the optional `unbound` binding, which `bns` already guards with a JavaScript resolver
  fallback.

## Requirements

Windows 10/11 x64 with:

- **Node.js 22 LTS** â€?the tested configuration, and what CI uses.
- **Visual Studio Build Tools** with the *Desktop development with C++* workload.
- **Windows 10 SDK 10.0.19041.0** â€?`bcrypto` and `bdb` publish no prebuilt binaries, so a
  compiler and this SDK are mandatory. Without it the native build stops at `MSB8036`.

## Build from source

```bat
git clone https://github.com/Furrium/FurryFly.git
cd FurryFly
npm install
npm run build
npm run package-win
```

The installer is written to `.\release\`.

For day-to-day work, `npm run dev` serves the renderer with hot reload, and
`npm run start-main-dev` runs the main process with an inspector on port 5858.

Note that `npm run build` refuses to run against a dirty working tree: it records the commit and
`git status` into `dist/build-provenance.json`, so commit first.

See [BUILD.md](./BUILD.md) for the full toolchain notes and troubleshooting.

## Tests

```bat
npm test
```

On a machine whose system drive is nearly full the packaged harness can fail on disk
headroom rather than on the code: it refuses to start a node with less than 10 GiB free,
and its scratch profiles live in `os.tmpdir()`. Use `npm run test:f` to keep them on
`F:\FNS\tmp` instead, or point `TEMP` at a roomier drive.

## Site URLs

`branding.siteUrl` is `https://furryfly.com`. Every help and documentation link in the
app builds its URL from that value, so the site must serve these paths. They are listed
here because the site is the other half of this contract: a link that has no page behind
it is worse than no link.

| Path | Used by |
| --- | --- |
| `/` | Add-ons page footer link |
| `/docs/wallet-aliases` | Send screen, alias help |
| `/docs/wallet-balances/` | Overview balance guide (locale-prefixed: `/zh`, `/ru`, `/th`) |
| `/docs/add-ons` | Add-ons page help |
| `/docs/expiring-names` | Expiring names help |
| `/docs/messages` | Messages help |
| `/docs/liquidity-spot` | Add-ons, Liquidity.spot integration |
| `/docs/shakedex-safety` | Settings, Shakedex safety note |
| `/docs/spv-helper-api-v1` | Settings, SPV helper API |
| `/standards/bob-spv-helper-api-v1.md` | Settings, SPV helper API specification |
| `/game/play` | Add-on example (external-content origin) |

The spec path keeps its `bob-spv` filename on purpose: it names the protocol, which is
still the Bob SPV helper API, not the product.

## Data locations

| What | Where |
| --- | --- |
| Profile (wallet, chain data, settings) | `%APPDATA%\FurryFly` |
| Deep links | `furryfly://` |

## Known limitations


## License

FurryFly is distributed under the **GNU General Public License, version 3 only**. See
[LICENSE](./LICENSE).

It is a modified version of Bob Wallet (https://github.com/shadstoneofficial/bob-wallet), which
is also GPLv3. As the license requires of a modified version, the complete source for this
version is this repository.

FurryFly is not affiliated with, or endorsed by, the Bob Wallet project.
