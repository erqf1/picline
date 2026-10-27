// Farben der Oberfläche (hell/dunkel) und die Akzentfarbe als CSS-Variablen.
import { parseHex, luminance } from './color.js';

const LIGHT = {
  bg: '#f3f4f7', panel: '#ffffff', panel2: '#f2f3f6', line: '#e2e5eb', text: '#1b1f27', muted: '#6b7280', hover: 'rgba(0,0,0,0.05)',
  canvasBg: '#e3e6ec', danger: '#dc2626', shadow: '0 12px 32px -12px rgba(20,24,40,0.28), 0 2px 6px rgba(20,24,40,0.08)',
};
const DARK = {
  bg: '#14161b', panel: '#1b1e25', panel2: '#232731', line: '#2d323d', text: '#e8eaf0', muted: '#9aa1b2', hover: 'rgba(255,255,255,0.06)',
  canvasBg: '#101216', danger: '#f87171', shadow: '0 16px 40px -12px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.35)',
};
export const ACCENTS = ['#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#64748b'];

export function applyTheme(accent, dark) {
  const v = { ...(dark ? DARK : LIGHT) };
  const a = parseHex(accent) || parseHex('#8b5cf6');
  v.accent = accent;
  v.accentText = luminance(a) > 0.62 ? '#111827' : '#ffffff';
  v.accentSoft = `rgba(${a.r},${a.g},${a.b},${dark ? 0.22 : 0.14})`;
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  const names = { bg: '--bg', panel: '--panel', panel2: '--panel2', line: '--line', text: '--text', muted: '--muted', hover: '--hover', canvasBg: '--canvas-bg', danger: '--danger', shadow: '--shadow', accent: '--accent', accentText: '--accent-text', accentSoft: '--accent-soft' };
  for (const [k, css] of Object.entries(names)) root.style.setProperty(css, v[k]);
  root.style.colorScheme = dark ? 'dark' : 'light';
  return v;
}
