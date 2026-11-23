# Build Instruction

This fork builds a **Windows** product only. macOS and Linux packaging targets,
signing/notarization tooling and their CI jobs have been removed.

## Prerequisites (Windows)

Two runtime dependencies ship **no prebuilt binaries** and are compiled from
source on every install:

| Package | Install script | Notes |
| --- | --- | --- |
| `bcrypto@5.4.0` | `node-gyp rebuild` | core crypto primitives |
| `bdb@1.6.2` | `node-gyp rebuild` | bundled LevelDB |
| `node-hid` (via `hsd-ledger`) | `prebuild-install \|\| node-gyp rebuild` | Ledger hardware wallet |

`npm install` therefore **requires a C++ toolchain *and* a Windows SDK**.
Visual Studio Build Tools alone are not sufficient: the *Desktop development
with C++* workload must also include a Windows SDK. Without one, `npm install`
fails while building `node-hid` with:

```text
error MSB8036: The Windows SDK version 10.0.19041.0 was not found.
```

### Required components

1. **Node.js 22 LTS** — matches CI and the tested configuration. Node 24 is not
   a tested configuration for these native modules.
2. **Visual Studio 2022 Build Tools** with *Desktop development with C++*.
3. **Windows 10/11 SDK** (10.0.19041.0 or newer).
4. **Python 3.6+** for node-gyp (3.11 is verified).

Install the SDK from an **elevated** prompt:

```powershell
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vs_installer.exe" modify `
  --installPath "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools" `
  --add Microsoft.VisualStudio.Component.Windows10SDK.19041 `
  --quiet --norestart
```

Then confirm the SDK headers and libraries actually exist — an empty
`Windows Kits\10` folder is the usual cause of `MSB8036`:

```powershell
Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\Include'
Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\Lib'
```

## Install

```powershell
git clone <your-fork-url>
cd bob-wallet
npm install
```

`npm install` runs `postinstall`, which rebuilds the native modules against
Electron's ABI via `electron-builder install-app-deps`.

## Develop

```powershell
npm run dev
```

This starts `webpack-dev-server` with hot reload for the renderer. To also
enable the main-process inspector on port 5858:

```powershell
npm run start-main-dev
```

To run the production build locally (`prestart` builds first):

```powershell
npm start
```

## Test

```powershell
npm test
```

## Package for Windows

```powershell
npm run package-win
```

The `.msi` installer is written to `.\release\`.

To remove build output:

```powershell
npm run clean
```

## Saving disk space

Electron and electron-builder cache large downloads under `%LOCALAPPDATA%` on
the system drive, not beside the repository. On a machine with a small system
drive, redirect them **before** installing:

```powershell
[Environment]::SetEnvironmentVariable('ELECTRON_CACHE', 'F:\caches\electron', 'User')
[Environment]::SetEnvironmentVariable('ELECTRON_BUILDER_CACHE', 'F:\caches\electron-builder', 'User')
```

The Electron binary alone is a few hundred MB, and electron-builder's Windows
toolchain cache (`winCodeSign`, `nsis`) adds roughly another gigabyte.

## Troubleshooting

**`error MSB8036: The Windows SDK version 10.0.19041.0 was not found`**
The Windows SDK is missing or incomplete. See *Prerequisites* above. An empty
`C:\Program Files (x86)\Windows Kits\10\Include` is the usual cause; Visual
Studio Build Tools by themselves are not enough.

**`error C1083: cannot open include file: "unbound.h"`**
Expected, and not a problem. `unbound` binds the external libunbound C library,
which is not part of the Windows SDK. It is an *optional* dependency of `bns`,
and `bns/lib/resolver/unbound.js` falls back to bns's pure-JS recursive resolver
when it cannot be loaded. `scripts/rebuild-native.js` therefore excludes it. If
you later provide libunbound for Windows x64, build it with:

```powershell
node scripts/rebuild-native.js --include-unbound
```

**`node_modules\electron\dist\electron.exe` is missing**
`npm install --ignore-scripts` skips Electron's binary download, and a later
plain `npm install` will *not* repair it — npm only runs install scripts for
packages it actually (re)installs. Download it explicitly:

```powershell
node node_modules/electron/install.js
```

**`Error: Build provenance requires a clean source worktree`**
`npm run build` ends by writing `dist/build-provenance.json`, which refuses to
record a build from a dirty tree. Commit (or stash) your changes and rebuild.
