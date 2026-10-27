'use strict';

// Windows: Dateisymbole (hell oder dunkel) für die Dateitypen von Picline umschalten.
// Der Installer legt je Typ eine ProgID "Picline.<typ>" an (Symbol: hell). Hier wird nur deren DefaultIcon in HKCU
// umgebogen - HKCU geht vor HKLM und braucht keine Adminrechte. Portable Version und andere Systeme: nichts zu tun.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, nativeTheme } = require('electron');

const dir = (variant) => path.join(process.resourcesPath || '', 'filetypes', variant);

function available() {
  return process.platform === 'win32' && app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR && fs.existsSync(dir('light'));
}

/** 'auto' folgt dem Windows-Modus für Apps (wie der Explorer) */
function resolve(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

const run = (file, args) => new Promise((done) => execFile(file, args, { windowsHide: true, timeout: 20000 }, (err) => done(!err)));

/** Schreibt die Symbole für 'variant' und lässt den Explorer sie neu laden. */
async function apply(variant) {
  if (!available()) return false;
  const icons = fs.readdirSync(dir(variant)).filter((f) => f.endsWith('.ico'));
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const lines = ['Windows Registry Editor Version 5.00', ''];
  for (const f of icons) {
    lines.push(`[HKEY_CURRENT_USER\\Software\\Classes\\Picline.${path.basename(f, '.ico')}\\DefaultIcon]`);
    lines.push(`@="${esc(path.join(dir(variant), f))}"`, '');
  }
  const regFile = path.join(os.tmpdir(), `picline-icons-${process.pid}.reg`);
  // reg import erwartet UTF-16 mit BOM
  fs.writeFileSync(regFile, Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf16le'));
  const ok = await run('reg.exe', ['import', regFile]);
  fs.rmSync(regFile, { force: true });
  // Explorer: "Zuordnungen geändert" melden, damit die Symbole sofort neu gezeichnet werden
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "Add-Type -Namespace TL -Name Shell -MemberDefinition '[DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int e, int f, IntPtr a, IntPtr b);'; [TL.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)"]);
  return ok;
}

/** Beim Start und nach Änderungen: nur schreiben, wenn sich etwas geändert hat (oder nach einem Update, das wieder "hell" eingetragen hat). */
async function sync(settings, save) {
  if (!available()) return;
  const want = resolve(settings.fileIcons || 'auto');
  if (want === 'light' && settings.fileIconsApplied !== 'dark') return;  // so hat es der Installer eingetragen
  if (await apply(want)) save({ fileIconsApplied: want });
}

module.exports = { available, resolve, apply, sync };
