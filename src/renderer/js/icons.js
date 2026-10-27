// Symbole als SVG (24er-Raster, Linien in currentColor)
const P = {
  select: '<path d="M4 7V5a1 1 0 0 1 1-1h2M11 4h2M17 4h2a1 1 0 0 1 1 1v2M20 11v2M20 17v2a1 1 0 0 1-1 1h-2M13 20h-2M7 20H5a1 1 0 0 1-1-1v-2M4 13v-2"/>',
  selectEllipse: '<ellipse cx="12" cy="12" rx="8.5" ry="7" stroke-dasharray="3 2.6"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  brush: '<path d="M18.4 3.6a2 2 0 0 1 2.8 2.8l-8.5 8.5-2.8-2.8z"/><path d="M9.9 12.1c-2.2-.3-4 1.3-4.2 3.4-.2 1.7-.9 2.8-2.2 3.5 3.6 1.3 7.3.4 8.6-2.1.6-1.2.4-2.4-.2-3.3"/>',
  pixel: '<path d="M4 4h5v5H4zM9 9h5v5H9zM14 14h5v5h-5z"/><path d="M14 4h5v5h-5z" opacity=".35"/>',
  eraser: '<path d="m15.5 4.5 4 4a1.4 1.4 0 0 1 0 2L11 19H7l-3-3a1.4 1.4 0 0 1 0-2l9.5-9.5a1.4 1.4 0 0 1 2 0z"/><path d="M9 9.5 14.5 15M11 19h9"/>',
  fill: '<path d="m5 11 7-7 7 7-7 7a1.4 1.4 0 0 1-2 0l-5-5a1.4 1.4 0 0 1 0-2z"/><path d="M5 12h14"/><path d="M20 15s1.6 2.2 1.6 3.3a1.6 1.6 0 0 1-3.2 0c0-1.1 1.6-3.3 1.6-3.3z"/>',
  picker: '<path d="m14.5 6.5 3 3"/><path d="M17.8 3.2a2.2 2.2 0 0 1 3 3l-2.3 2.3-3-3z"/><path d="M15.5 5.5 5.6 15.4 4 20l4.6-1.6 9.9-9.9"/>',
  shapes: '<rect x="3.5" y="10" width="9" height="9" rx="1.5"/><circle cx="15.5" cy="8.5" r="5"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5V4a1.5 1.5 0 0 1 3 0v8M14 11.5V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.3a6 6 0 0 1-5-2.7L5 14.7a1.6 1.6 0 0 1 2.6-1.8L8 13.5"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M8 10.5h5M10.5 8v5"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M8 10.5h5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.5M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  layerAdd: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 4-2.2M18 15v6M15 18h6"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  merge: '<path d="M7 4v5a5 5 0 0 0 5 5 5 5 0 0 1 5 5v1M17 4v5a5 5 0 0 1-2 4"/><path d="m14 18 3 3 3-3" transform="translate(-3 -1)"/>',
  swap: '<path d="M7 4 4 7l3 3"/><path d="M4 7h11a5 5 0 0 1 5 5"/><path d="m17 20 3-3-3-3"/><path d="M20 17H9a5 5 0 0 1-5-5"/>',
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1"/><path d="M3 7v11a2 2 0 0 0 2 2h13.3a2 2 0 0 0 1.9-1.4L22 12H7.3a2 2 0 0 0-1.9 1.4L3 20"/>',
  newImage: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8.5v7M8.5 12h7"/>',
  save: '<path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m21 16-5-5-9 9"/>',
  grid: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"/>',
  expand: '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/><path d="m4 4 5 5M20 4l-5 5M4 20l5-5M20 20l-5-5"/>',
  fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  mirror: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 7 4 12l5 5zM15 7l5 5-5 5z"/>',
  tile: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  // Formen
  line: '<path d="M5 19 19 5"/>',
  arrow: '<path d="M5 19 19 5M10 5h9v9"/>',
  rect: '<rect x="4" y="6" width="16" height="12"/>',
  roundrect: '<rect x="4" y="6" width="16" height="12" rx="4"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
  triangle: '<path d="M12 4.5 20.5 19h-17z"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.8l-5.3 2.8 1.1-5.8-4.3-4.1 5.9-.8z"/>',
  hexagon: '<path d="M12 3.5 19.5 8v8L12 20.5 4.5 16V8z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  bubble: '<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
  // Pinselarten
  brushRound: '<circle cx="12" cy="12" r="6"/>',
  brushMarker: '<rect x="8" y="5" width="8" height="14" rx="1.5"/>',
  brushCalli: '<path d="M7 17 17 7"/><path d="M9.5 19.5 4.5 14.5 14.5 4.5l5 5z"/>',
  brushSpray: '<circle cx="8" cy="8" r="1"/><circle cx="13" cy="6" r="1"/><circle cx="16" cy="11" r="1"/><circle cx="10" cy="13" r="1"/><circle cx="6" cy="15" r="1"/><circle cx="14" cy="16" r="1"/><circle cx="18" cy="17" r="1"/><circle cx="11" cy="19" r="1"/>',
  brushPencil: '<path d="m4 20 1.5-5L16 4.5a2.1 2.1 0 0 1 3 3L8.5 18z"/><path d="m14 6.5 3 3"/>',
  // Ausrichtung Text
  alignLeft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  alignCenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignRight: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
  underline: '<path d="M7 4v6a5 5 0 0 0 10 0V4M5 20h14"/>',
  flipH: '<path d="M12 3v18"/><path d="M9 7 4 17h5zM15 7l5 10h-5z"/>',
  flipV: '<path d="M3 12h18"/><path d="M7 9 17 4v5zM7 15l10 5v-5z"/>',
  rotateL: '<path d="M4 4v6h6"/><path d="M4.5 10A8 8 0 1 1 6 16.5"/>',
  rotateR: '<path d="M20 4v6h-6"/><path d="M19.5 10A8 8 0 1 0 18 16.5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5" opacity=".55"/>',
  effects: '<path d="M11 3l1.9 4.9L18 9.8l-5.1 1.9L11 17l-1.9-5.3L4 9.8l5.1-1.9z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  fxGray: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  fxInvert: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M20 4 4 20h16z" fill="currentColor"/>',
  fxSepia: '<path d="M5 8h12v5a6 6 0 0 1-12 0z"/><path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2M11 3v2M14 3v2"/>',
  fxSteps: '<path d="M4 20v-5h5v-5h5V5h6v15z"/>',
  fxThreshold: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M12 6l5 2M12 10l7 1M12 14l7-1M12 18l5-2"/>',
  fxBlur: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9 14a3 3 0 0 0 3 3" opacity=".6"/>',
  fxSharpen: '<path d="M12 3 21 20H3z"/><path d="M12 9v5M12 17h.01"/>',
  fxOutline: '<rect x="4" y="4" width="16" height="16" rx="4" stroke-dasharray="3 2.4"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.5" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/>',
};

export function icon(name, size = 18, extra = '') {
  const d = P[name] || '';
  return `<svg class="ico${extra ? ` ${extra}` : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

/** Das Picline-Logo (Pinsel und drei Pixel auf Farbverlauf) - gleiches Bild wie assets/icon.png */
export function logoSvg(size = 64) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="pl-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6fb1"/><stop offset="1" stop-color="#7c4dff"/></linearGradient></defs>
<rect x="4" y="4" width="56" height="56" rx="14" fill="url(#pl-g)"/>
<rect x="13" y="13" width="8" height="8" rx="1.2" fill="#fff" opacity=".95"/><rect x="21" y="21" width="8" height="8" rx="1.2" fill="#fff" opacity=".7"/><rect x="13" y="29" width="8" height="8" rx="1.2" fill="#fff" opacity=".45"/>
<path d="M47.5 15.5a3.4 3.4 0 0 1 4.8 4.8L37.6 35l-4.8-4.8z" fill="#fff"/>
<path d="M31.6 32.4c-3.8-.5-6.9 2.2-7.2 5.8-.3 2.9-1.5 4.8-3.8 6 6.2 2.2 12.6.7 14.8-3.6 1-2 .7-4.1-.3-5.7z" fill="#fff"/></svg>`;
}
