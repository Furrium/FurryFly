import { app, Menu, shell } from 'electron';
import showMainWindow, { getMainWindow } from './mainWindow';
const pkg = require('../package.json');
const BRAND = require('./constants/branding');
const Path = require('path');

export default class MenuBuilder {
  buildMenu() {

    // https://www.electronjs.org/docs/all#appsetaboutpaneloptionsoptions
    // version: MacOS only
    // credits: MacOS & Windows only
    // authors: Linux only
    // website: Linux only
    // iconPath: Linux & Windows only
    app.setAboutPanelOptions({
      applicationName: pkg.productName, 
      applicationVersion: pkg.version,
      copyright: `License: ${pkg.license}`,
      version: pkg.version,
      credits: pkg.author,
      author: pkg.author,
      website: pkg.homepage,
      iconPath: Path.join(process.resourcesPath, 'icons/128x128.png')
    });

    this.setupDevelopmentEnvironment();

    // The window draws its own title bar, so a native menu would be a second, mostly
    // empty strip above it: File only held Close, View only held full screen, and
    // Help only two links. macOS keeps its menu because the OS expects one (the app
    // menu carries Quit and About); elsewhere there is no menu at all.
    if (process.platform !== 'darwin') {
      Menu.setApplicationMenu(null);
      this.installKeyboardShortcuts();
      return null;
    }

    const template = this.buildDarwinTemplate();
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    return menu;
  }

  // Removing the menu also removed the accelerators it carried, so the handful worth
  // keeping are bound directly to the window instead.
  installKeyboardShortcuts() {
    const mainWin = getMainWindow();
    if (!mainWin) return;

    mainWin.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;

      if (input.key === 'F11') {
        event.preventDefault();
        mainWin.setFullScreen(!mainWin.isFullScreen());
        return;
      }

      // Ctrl+R and Ctrl+Shift+I stay available in development builds only; shipping
      // them would let a user reload the renderer out from under the wallet.
      if (process.env.NODE_ENV === 'development') {
        if (input.control && !input.shift && input.key.toLowerCase() === 'r') {
          event.preventDefault();
          mainWin.webContents.reload();
        } else if (input.control && input.shift && input.key.toLowerCase() === 'i') {
          event.preventDefault();
          mainWin.toggleDevTools();
        }
      }
    });
  }

  setupDevelopmentEnvironment() {
    const mainWin = getMainWindow();
    mainWin.webContents.on('context-menu', (e, props) => {
      const {x, y} = props;
      Menu.buildFromTemplate([
        {
          label: 'Inspect element',
          click: () => {
            mainWin.inspectElement(x, y);
          }
        }
      ]).popup(mainWin);
    });
  }

  buildDarwinTemplate() {
    const mainWin = getMainWindow();

    const subMenuAbout = {
      label: BRAND.displayName,
      submenu: [
        {
          label: `About ${BRAND.displayName}`,
          role: 'about'
        },
        {type: 'separator'},
        {label: 'Services', submenu: []},
        {type: 'separator'},
        {
          label: `Hide ${BRAND.displayName}`,
          accelerator: 'Command+H',
          role: 'hide'
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Shift+H',
          role: 'hideOthers'
        },
        {label: 'Show All', role: 'unhide'},
        {type: 'separator'},
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    };
    const subMenuEdit = {
      label: 'Edit',
      submenu: [
        {label: 'Undo', accelerator: 'Command+Z', role: 'undo'},
        {label: 'Redo', accelerator: 'Shift+Command+Z', role: 'redo'},
        {type: 'separator'},
        {label: 'Cut', accelerator: 'Command+X', role: 'cut'},
        {label: 'Copy', accelerator: 'Command+C', role: 'copy'},
        {label: 'Paste', accelerator: 'Command+V', role: 'paste'},
        {
          label: 'Select All',
          accelerator: 'Command+A',
          role: 'selectAll'
        }
      ]
    };
    const subMenuViewDev = {
      label: 'View',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'Command+N',
          click: showMainWindow,
        },
        {
          label: 'Reload',
          accelerator: 'Command+R',
          click: this.withMain((m) => m.webContents.reload())
        },
        {
          label: 'Toggle Full Screen',
          accelerator: 'Ctrl+Command+F',
          click: this.withMain((m) => m.setFullScreen(!mainWin.isFullScreen()))
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+Command+I',
          click: this.withMain((m) => m.toggleDevTools()),
        }
      ]
    };
    const subMenuViewProd = {
      label: 'View',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'Command+N',
          click: showMainWindow,
        },
        {
          label: 'Reload',
          accelerator: 'Command+R',
          click: this.withMain((m) => m.webContents.reload())
        },
        {
          label: 'Toggle Full Screen',
          accelerator: 'Ctrl+Command+F',
          click: this.withMain((m) => m.setFullScreen(!m.isFullScreen()))
        }
      ]
    };
    const subMenuWindow = {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'Command+M',
          role: 'minimize'
        },
        {label: 'Close', accelerator: 'Command+W', role: 'close'},
        {type: 'separator'},
        {label: 'Bring All to Front', role: 'front'}
      ]
    };
    const subMenuHelp = {
      label: 'Help',
      submenu: [
        {
          label: 'Report an Issue',
          click() {
            shell.openExternal(pkg.bugs.url);
          }
        }
      ]
    };

    const subMenuView =
      process.env.NODE_ENV === 'development' ? subMenuViewDev : subMenuViewProd;

    return [subMenuAbout, subMenuEdit, subMenuView, subMenuWindow, subMenuHelp];
  }

  withMain(cb) {
    return () => {
      const mainWin = getMainWindow();
      if (!mainWin) {
        return;
      }

      cb(mainWin);
    }
  }
}
