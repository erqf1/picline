'use strict';

// "Als Standard-App festlegen" - gleiche Datei in Textline, Picline und Webline (src/defaults.js).
// Liest je Dateigruppe, welches Programm sie gerade öffnet, und setzt das Programm als Standard:
//  - Linux: xdg-mime default (sofort)
//  - macOS: LSSetDefaultRoleHandlerForContentType über osascript/JXA (sofort)
//  - Windows: Programme dürfen das seit Windows 8 nicht selbst - es öffnet sich die Seite des Programms unter
//    Einstellungen > Apps > Standard-Apps (das Programm ist dort per Installer eingetragen, RegisteredApplications).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

// Alle Programme von W Software: gehört ein Typ einem davon, wird er nicht vorausgewählt (keine Überschneidung)
const W_APPS = ['Vidline', 'Cutline', 'Clipline', 'Webline', 'Webcase', 'Textline', 'Picline', 'Convertline'];

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: String(stdout || ''), err: String(stderr || (err && err.message) || '') }));
  });
}

function ownerOf(appName, self) {
  if (!appName) return null;
  const n = String(appName).toLowerCase();
  if (n.includes(self.toLowerCase())) return self;
  return W_APPS.find((w) => n.includes(w.toLowerCase())) || null;
}

// ---------------------------------------------------------------- Windows
const WIN_PS = (exts, name) => `[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -Namespace WHub -Name Assoc -MemberDefinition '[DllImport("Shlwapi.dll", CharSet = CharSet.Unicode)] public static extern uint AssocQueryString(uint flags, uint str, string assoc, string extra, System.Text.StringBuilder outStr, ref uint len);'
$res = @{}
foreach ($e in @(${exts.map((e) => `'${e.replace(/'/g, '')}'`).join(',')})) {
  $uc = Get-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.$e\\UserChoice" -ErrorAction SilentlyContinue
  # zuerst die Wahl des Benutzers (UserChoice), sonst die Endung selbst
  $q = if ($uc.ProgId) { [string]$uc.ProgId } else { ".$e" }
  $sb = New-Object System.Text.StringBuilder 512
  [uint32]$len = 512
  $null = [WHub.Assoc]::AssocQueryString(0, 4, $q, 'open', $sb, [ref]$len)
  $exe = New-Object System.Text.StringBuilder 1024
  [uint32]$len = 1024
  $null = [WHub.Assoc]::AssocQueryString(0, 2, $q, 'open', $exe, [ref]$len)
  # "App auswählen" = Windows fragt jedes Mal, also noch kein Standard
  if ($exe.ToString() -match 'OpenWith\.exe$') { $sb.Clear() | Out-Null }
  $res[$e] = @{ progId = [string]$uc.ProgId; app = $sb.ToString() }
}
$where = ''
if (Get-ItemProperty 'HKCU:\\Software\\RegisteredApplications' -Name '${name}' -ErrorAction SilentlyContinue) { $where = 'user' }
elseif (Get-ItemProperty 'HKLM:\\Software\\RegisteredApplications' -Name '${name}' -ErrorAction SilentlyContinue) { $where = 'machine' }
ConvertTo-Json -Compress -Depth 4 @{ types = $res; registered = $where }`;

async function winState(cfg) {
  const exts = [...new Set(cfg.groups.flatMap((g) => g.exts))];
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(WIN_PS(exts, cfg.name), 'utf16le').toString('base64')]);
  let data = { types: {}, registered: '' };
  try {
    data = JSON.parse(r.out.trim() || '{}');
  } catch {
    // ohne Daten: alles als unbekannt zeigen
  }
  const groups = cfg.groups.map((g) => {
    const per = g.exts.map((e) => {
      const t = (data.types || {})[e] || {};
      const mine = (t.progId || '').toLowerCase().startsWith(`${cfg.name.toLowerCase()}.`) || ownerOf(t.app, cfg.name) === cfg.name || (cfg.progIds || []).includes(t.progId);
      return { ext: e, app: t.app || '', mine };
    });
    const done = per.filter((p) => p.mine).length;
    const other = per.find((p) => !p.mine && p.app);
    return { id: g.id, done, total: per.length, mine: done === per.length, current: other ? other.app : '', owner: other ? ownerOf(other.app, cfg.name) : null };
  });
  return { platform: 'win32', registered: data.registered || '', groups };
}

// ---------------------------------------------------------------- Linux
function desktopName(id) {
  const dirs = [process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), ...(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':')];
  for (const d of dirs) {
    try {
      const text = fs.readFileSync(path.join(d, 'applications', id), 'utf8');
      const m = /^Name=(.+)$/m.exec(text);
      if (m) return m[1].trim();
    } catch {
      // nächster Ordner
    }
  }
  return id.replace(/\.desktop$/, '');
}

async function linuxState(cfg) {
  const groups = await Promise.all(cfg.groups.map(async (g) => {
    const r = await run('xdg-mime', ['query', 'default', g.mimes[0]]);
    const id = r.out.trim();
    const mine = id === cfg.desktopId;
    const name = id ? desktopName(id) : '';
    return { id: g.id, done: mine ? 1 : 0, total: 1, mine, current: mine ? '' : name, owner: mine ? cfg.name : ownerOf(name, cfg.name) };
  }));
  return { platform: 'linux', registered: 'user', groups };
}

// ---------------------------------------------------------------- macOS
const MAC_STATE = `ObjC.import('AppKit'); ObjC.import('UniformTypeIdentifiers');
function run(argv) { const utis = JSON.parse(argv[0]); const ws = $.NSWorkspace.sharedWorkspace; const out = {};
  for (const u of utis) { try { const t = $.UTType.typeWithIdentifier(u); const url = t ? ws.URLForApplicationToOpenContentType(t) : null;
    if (!url || url.isNil()) { out[u] = null; continue; } const b = $.NSBundle.bundleWithURL(url);
    out[u] = { name: ObjC.unwrap(url.lastPathComponent).replace(/\\.app$/, ''), id: b && !b.isNil() ? ObjC.unwrap(b.bundleIdentifier) : '' }; } catch (e) { out[u] = null; } }
  return JSON.stringify(out); }`;
const MAC_SET = `ObjC.import('CoreServices');
function run(argv) { const utis = JSON.parse(argv[0]); const id = argv[1]; const bad = [];
  for (const u of utis) { const r = $.LSSetDefaultRoleHandlerForContentType($(u), 0xFFFFFFFF, $(id)); if (r !== 0) bad.push(u + ':' + r); }
  return JSON.stringify(bad); }`;

async function macState(cfg) {
  const utis = cfg.groups.map((g) => g.utis[0]);
  const r = await run('osascript', ['-l', 'JavaScript', '-e', MAC_STATE, JSON.stringify(utis)]);
  let data = {};
  try {
    data = JSON.parse(r.out.trim() || '{}');
  } catch {
    // leer lassen
  }
  const groups = cfg.groups.map((g) => {
    const cur = data[g.utis[0]];
    const mine = !!cur && cur.id === cfg.bundleId;
    const name = cur ? cur.name : '';
    return { id: g.id, done: mine ? 1 : 0, total: 1, mine, current: mine ? '' : name, owner: mine ? cfg.name : ownerOf(name, cfg.name) };
  });
  return { platform: 'darwin', registered: 'user', groups };
}

// ---------------------------------------------------------------- Festlegen
async function apply(cfg, ids) {
  const chosen = cfg.groups.filter((g) => ids.includes(g.id));
  if (!chosen.length) return { ok: true };
  if (process.platform === 'linux') {
    const mimes = [...new Set(chosen.flatMap((g) => g.mimes))];
    const r = await run('xdg-mime', ['default', cfg.desktopId, ...mimes]);
    return { ok: r.ok, error: r.ok ? '' : r.err.slice(0, 300) };
  }
  if (process.platform === 'darwin') {
    const utis = [...new Set(chosen.flatMap((g) => g.utis))];
    const r = await run('osascript', ['-l', 'JavaScript', '-e', MAC_SET, JSON.stringify(utis), cfg.bundleId]);
    let bad = [];
    try {
      bad = JSON.parse(r.out.trim() || '[]');
    } catch {
      bad = ['?'];
    }
    return { ok: r.ok && !bad.length, error: r.ok ? bad.join(', ') : r.err.slice(0, 300) };
  }
  // Windows: Einstellungsseite des Programms
  const st = await winState(cfg);
  const key = st.registered === 'machine' ? 'registeredAppMachine' : 'registeredAppUser';
  await cfg.shell.openExternal(st.registered ? `ms-settings:defaultapps?${key}=${encodeURIComponent(cfg.name)}` : 'ms-settings:defaultapps');
  return { ok: true, settings: true };
}

/** Im Hauptprozess einrichten: cfg = { name, desktopId, bundleId, progIds?, groups, ipcMain, shell } */
function setupDefaults(cfg) {
  cfg.ipcMain.handle('defaults:state', async () => {
    if (process.platform === 'win32') return winState(cfg);
    if (process.platform === 'darwin') return macState(cfg);
    return linuxState(cfg);
  });
  cfg.ipcMain.handle('defaults:apply', (_e, ids) => apply(cfg, Array.isArray(ids) ? ids : []));
  // Texte und Gruppen für Oberflächen ohne Bundler (Webline)
  cfg.ipcMain.handle('defaults:info', (_e, lang) => ({ texts: require('./shared/default-strings').all(lang), groups: cfg.groups.map(({ id, label, exts, primary }) => ({ id, label, exts, primary })), name: cfg.name }));
}

module.exports = { setupDefaults, ownerOf };
