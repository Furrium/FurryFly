# TRANSFUR: a Handshake wallet and full node

TRANSFUR is a desktop wallet for [Handshake](https://handshake.org) with an
integrated full node and name-auction manager. It is a customized build of
[Bob Wallet](https://github.com/shadstoneofficial/bob-wallet).

**Status: early development.** Treat these builds as beta and test with a fresh
wallet on a test network before using real funds.

## Supported builds

| Platform | Architecture | Installer |
| --- | --- | --- |
| macOS | Apple Silicon (arm64) | DMG |
| macOS | Intel (x64) | DMG |
| Windows | ARM64 | NSIS setup EXE (native ARM64 application) |
| Windows | x64 | MSI |

See [GitHub Actions](https://github.com/Furrium/transfur/actions) for CI results
and installer artifacts. CI builds include a SHA-256 checksum and do not use
Windows Authenticode or Apple Developer ID signing/notarization. Linux is not packaged.

## Build from source

Use Node.js 22 of the **same architecture** as the application you are building.
See [BUILD.md](./BUILD.md) for compiler prerequisites and verification steps.

```sh
git clone https://github.com/Furrium/transfur.git
cd transfur
npm ci --ignore-scripts
npm run postinstall
npm test
npm run package-mac   # macOS only
# npm run package-win  # Windows only
```

Installers go under `release/<platform>-<arch>/`. The build records Git
provenance and refuses to package a dirty working tree.

## Behavior and data

- TRANSFUR uses app ID `co.transfur.wallet`, the `transfur://` URL scheme and
  independent node, wallet and DNS ports (Handshake defaults + 3000), so it can
  coexist with Bob Wallet.
- Crash reporting and upstream update checks are off by default.
- Native dependencies are built explicitly for Electron and the target CPU.
  `goosig` uses bundled mini-GMP; the optional `unbound` binding is not needed.

| Data | Location |
| --- | --- |
| macOS profile | `~/Library/Application Support/Transfur` |
| Windows profile | `%APPDATA%\Transfur` |
| Default node data | `hsd_data` in the profile, except for `E:\Transfur\hsd_data` on Windows when available |

A node data directory explicitly chosen in Settings takes precedence.

## Site URLs

In-app help links are built from `branding.siteUrl` (`https://transfur.co`).
These are the paths used by the app and should be maintained alongside it:

| Path | Used by |
| --- | --- |
| `/` | Add-ons footer |
| `/docs/wallet-aliases` | Send address alias help |
| `/docs/wallet-balances/` | Overview balance guide |
| `/docs/add-ons` | Add-ons help |
| `/docs/expiring-names` | Expiring names help |
| `/docs/messages` | Message signing help |
| `/docs/liquidity-spot` | Liquidity.spot integration |
| `/docs/shakedex-safety` | Shakedex safety note |
| `/docs/spv-helper-api-v1` | SPV helper API help |
| `/standards/bob-spv-helper-api-v1.md` | Bob SPV protocol specification |
| `/game/play` | Add-on example |

The spec path keeps its `bob-spv` filename because it names the protocol, not the product.

## License

TRANSFUR is distributed under the **GNU General Public License, version 3 only**.
See [LICENSE](./LICENSE). It is a modified version of Bob Wallet and is not
endorsed by or affiliated with the Bob Wallet project.
