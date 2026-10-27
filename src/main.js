'use strict';

// Picline - Hauptprozess: Fenster, Dateien lesen/schreiben, Zwischenablage, Einstellungen und Updates.
// Malen, Ebenen, Menüs und Dialoge leben komplett im Renderer.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme, net, clipboard, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fileIcons = require('./fileicons');
const { t: tr } = require('./shared/i18n');

const APP_ID = 'win.mert.Picline';
const REPO = 'erqf1/picline';
// --selftest <ordner>: Selbsttest; --siteshots <ordner>: Bilder für die Website (beides unsichtbar)
const testArg = ['--selftest', '--siteshots'].find((a) => process.argv.includes(a));
const selfTest = testArg ? process.argv[process.argv.indexOf(testArg) + 1] : null;
const IMAGE_EXT = /\.(png|jpe?g|jfif|webp|bmp|gif|ico|cur|avif|svg|picline)$/i;

if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
if (selfTest) {
  app.setPath('userData', path.join(selfTest, 'userdata'));
  // Selbsttest läuft unsichtbar: Fehler nur ausgeben, nie als Fehlerfenster zeigen
  process.on('uncaughtException', (e) => {
    console.log('Fehler im Selbsttest:', e && e.stack ? e.stack : e);
    app.exit(1);
  });
}

let win = null;
let settings = {};
let closingAllowed = false;
const pendingFiles = [];

const userFile = (name) => path.join(app.getPath('userData'), name);
const t = (key, vars) => tr(settings.language || 'en', key, vars);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

/** Bilder aus der Befehlszeile ("Öffnen mit", Doppelklick) */
function filesFromArgs(argv, cwd) {
  const out = [];
  const args = argv.slice(app.isPackaged ? 1 : 2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--selftest' || a === '--siteshots') {
      i++;
      continue;
    }
    if (!a || a.startsWith('-')) continue;
    const p = path.resolve(cwd || process.cwd(), a);
    try {
      if (fs.statSync(p).isFile()) out.push(p);
    } catch {
      // gibt es nicht (z. B. Chromium-Schalter) - ignorieren
    }
  }
  return out;
}

if (!selfTest && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv, cwd) => {
    const list = filesFromArgs(argv, cwd);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (list.length) win.webContents.send('app:open-files', list);
    }
  });
}

// macOS: Dateien per Finder/Dock
app.on('open-file', (e, file) => {
  e.preventDefault();
  if (win && win.webContents && !win.webContents.isLoading()) win.webContents.send('app:open-files', [file]);
  else pendingFiles.push(file);
});

function createWindow() {
  const state = settings.window || {};
  win = new BrowserWindow({
    width: state.width || 1280,
    height: state.height || 820,
    x: state.x,
    y: state.y,
    minWidth: 640,
    minHeight: 420,
    show: false,
    title: 'Picline',
    backgroundColor: settings.mode === 'light' || (settings.mode !== 'dark' && !nativeTheme.shouldUseDarkColors) ? '#f3f4f7' : '#14161b',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
      // Selbsttest: das versteckte Fenster soll trotzdem normal zeichnen (Bilder)
      backgroundThrottling: !selfTest,
    },
  });
  if (state.maximized) win.maximize();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    if (!selfTest) win.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault();
  });
  const remember = () => {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const maximized = win.isMaximized();
    const b = maximized ? settings.window || {} : win.getBounds();
    settings.window = { x: b.x, y: b.y, width: b.width, height: b.height, maximized };
  };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('maximize', remember);
  win.on('unmaximize', remember);
  // Schließen: erst fragt der Renderer nach ungespeicherten Bildern, dann geht es zu
  win.on('close', (e) => {
    if (closingAllowed || selfTest) return;
    e.preventDefault();
    win.webContents.send('app:closing');
  });
  win.on('closed', () => {
    win = null;
  });
  // Vollbild (auch über das System beendet): Oberfläche ein-/ausblenden
  win.on('enter-full-screen', () => win.webContents.send('app:fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('app:fullscreen', false));
}

function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  // macOS braucht ein Bearbeiten-Menü, sonst gehen Kopieren/Einfügen per Cmd in Eingabefeldern nicht
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
}

// ---------------------------------------------------------------- IPC: Einstellungen
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (_e, next) => {
  const iconsBefore = settings.fileIcons;
  settings = { ...next, window: settings.window, fileIconsApplied: settings.fileIconsApplied };
  writeJson(userFile('settings.json'), settings);
  if (settings.fileIcons !== iconsBefore) syncFileIcons(true);
  return true;
});
function syncFileIcons(force) {
  const save = (patch) => {
    settings = { ...settings, ...patch };
    writeJson(userFile('settings.json'), settings);
  };
  if (force) {
    const want = fileIcons.resolve(settings.fileIcons || 'auto');
    fileIcons.apply(want).then((ok) => ok && save({ fileIconsApplied: want }));
  } else fileIcons.sync(settings, save);
}
ipcMain.handle('app:initial-files', () => {
  const list = [...filesFromArgs(process.argv, process.cwd()), ...pendingFiles];
  pendingFiles.length = 0;
  return list;
});
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  home: os.homedir(),
  pictures: (() => {
    try {
      return app.getPath('pictures');
    } catch {
      return os.homedir();
    }
  })(),
  dark: nativeTheme.shouldUseDarkColors,
  selfTest: !!selfTest,
  fileIcons: fileIcons.available(),
}));
ipcMain.handle('app:close-now', () => {
  closingAllowed = true;
  if (win) win.close();
});
ipcMain.handle('app:set-title', (_e, title) => {
  if (win) win.setTitle(title);
});
ipcMain.handle('win:fullscreen', () => {
  if (win) win.setFullScreen(!win.isFullScreen());
});
ipcMain.handle('win:set-fullscreen', (_e, on) => {
  if (win) win.setFullScreen(!!on);
});
nativeTheme.on('updated', () => {
  if (win) win.webContents.send('app:system-theme', nativeTheme.shouldUseDarkColors);
  if ((settings.fileIcons || 'auto') === 'auto' && fileIcons.resolve('auto') !== (settings.fileIconsApplied || 'light')) syncFileIcons(true);
});

// ---------------------------------------------------------------- IPC: Dateien
ipcMain.handle('file:open-dialog', async (_e, { title, filters, defaultPath, multi = true } = {}) => {
  const r = await dialog.showOpenDialog(win, { title, defaultPath, properties: multi ? ['openFile', 'multiSelections'] : ['openFile'], filters });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('file:save-dialog', async (_e, { title, defaultPath, filters } = {}) => {
  const r = await dialog.showSaveDialog(win, { title, defaultPath, filters });
  return r.canceled ? null : r.filePath;
});
const MAX_FILE = 300 * 1024 * 1024;
ipcMain.handle('file:read', (_e, file) => {
  try {
    const st = fs.statSync(file);
    if (st.size > MAX_FILE) return { error: 'TOO_BIG', size: st.size };
    const buf = fs.readFileSync(file);
    return { data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), mtime: st.mtimeMs };
  } catch (err) {
    return { error: err.code || String(err.message) };
  }
});
ipcMain.handle('file:write', (_e, file, data) => {
  try {
    // erst in eine Hilfsdatei, dann umbenennen: ein Absturz mittendrin zerstört nie das alte Bild
    const tmp = `${file}.picline-tmp`;
    fs.writeFileSync(tmp, Buffer.from(data));
    fs.renameSync(tmp, file);
    return { mtime: fs.statSync(file).mtimeMs };
  } catch (err) {
    return { error: err.code || String(err.message) };
  }
});
ipcMain.handle('file:exists', (_e, file) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
});
/** Bilder in einem Ordner (für "Nächstes/Vorheriges Bild") */
ipcMain.handle('file:siblings', (_e, file) => {
  try {
    const dir = path.dirname(file);
    return fs.readdirSync(dir).filter((f) => IMAGE_EXT.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
});

// ---------------------------------------------------------------- IPC: Zwischenablage (Bilder gehen über Electron am zuverlässigsten)
ipcMain.handle('clip:read-image', () => {
  const img = clipboard.readImage();
  if (!img.isEmpty()) {
    const png = img.toPNG();
    return new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
  }
  // kopierte Bilddatei im Explorer: Pfad aus der Zwischenablage
  const files = clipboard.readBuffer('FileNameW');
  if (files && files.length) {
    const p = files.toString('ucs2').replace(/\0+$/, '').split('\0')[0];
    if (p && IMAGE_EXT.test(p)) {
      try {
        const buf = fs.readFileSync(p);
        return { file: p, data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
      } catch {
        // nicht lesbar
      }
    }
  }
  return null;
});
ipcMain.handle('clip:write-image', (_e, png) => {
  clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(png)));
  return true;
});
ipcMain.handle('clip:write-text', (_e, text) => clipboard.writeText(String(text)));

ipcMain.handle('shell:open-external', (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
});
ipcMain.handle('shell:reveal', (_e, p) => shell.showItemInFolder(p));

// ---------------------------------------------------------------- Updates (wie bei Textline und Webline)
function isTarGz() {
  if (process.platform !== 'linux') return false;
  const exe = app.getPath('exe');
  return !exe.startsWith('/usr/') && !exe.startsWith('/opt/');
}

function setupAutoUpdate() {
  if (!app.isPackaged || selfTest) return;
  if (process.env.PORTABLE_EXECUTABLE_DIR || process.platform === 'darwin' || isTarGz()) return setupUpdateNotice();
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  let retry = null;
  autoUpdater.on('error', () => {
    clearTimeout(retry);
    retry = setTimeout(check, 10 * 60 * 1000);
  });
  const laterFile = userFile('update.json');
  let asking = false;
  autoUpdater.on('update-downloaded', async (info) => {
    const later = readJson(laterFile, {});
    if (asking || (later.version === info.version && Date.now() < later.until)) return;
    asking = true;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: [t('restartNow'), t('later')],
      defaultId: 0,
      cancelId: 1,
      title: t('updateTitle'),
      message: t('updateReady', { version: info.version }),
      detail: t('updateDetail'),
    });
    asking = false;
    if (response === 0) {
      closingAllowed = false;
      // erst nach ungespeicherten Bildern fragen lassen, dann installieren
      win.webContents.send('app:closing', { update: true });
      ipcMain.once('app:update-ready', () => {
        closingAllowed = true;
        autoUpdater.quitAndInstall();
      });
    } else {
      writeJson(laterFile, { version: info.version, until: Date.now() + 14 * 24 * 3600 * 1000 });
    }
  });
  setTimeout(check, 5000);
  setInterval(check, 60 * 60 * 1000);
}

function setupUpdateNotice() {
  const laterFile = userFile('update.json');
  const newer = (a, b) => {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  };
  let asked = false;
  const check = async () => {
    if (asked) return;
    try {
      const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Picline' },
      });
      if (!res.ok) return;
      const rel = await res.json();
      const version = String(rel.tag_name || '').replace(/^v/, '');
      if (!version || !newer(version, app.getVersion())) return;
      const later = readJson(laterFile, {});
      if (later.version === version && Date.now() < later.until) return;
      asked = true;
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        buttons: [t('openDownloadPage'), t('later')],
        defaultId: 0,
        cancelId: 1,
        title: t('updateTitle'),
        message: t('updateAvailable', { version }),
        detail: t('updateManualDetail'),
      });
      if (response === 0) shell.openExternal(rel.html_url || `https://github.com/${REPO}/releases/latest`);
      else writeJson(laterFile, { version, until: Date.now() + 14 * 24 * 3600 * 1000 });
    } catch {
      // offline - später nochmal
    }
  };
  setTimeout(check, 8000);
  setInterval(check, 6 * 60 * 60 * 1000);
}
ipcMain.on('app:update-ready', () => {});

// ---------------------------------------------------------------- Start
app.whenReady().then(() => {
  settings = readJson(userFile('settings.json'), {});
  buildMenu();
  createWindow();
  setupAutoUpdate();
  if (!selfTest) setTimeout(() => syncFileIcons(false), 3000);
  if (selfTest) require(path.join(__dirname, '..', 'tools', testArg === '--siteshots' ? 'siteshots.js' : 'selftest.js'))(win, selfTest);
});

app.on('before-quit', () => {
  try {
    writeJson(userFile('settings.json'), settings);
  } catch {
    // egal
  }
});
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (!win) createWindow();
});
