'use strict';

// Dateigruppen für "Als Standard-App festlegen" (Picline). primary = vorausgewählt, wenn kein anderes
// W-Software-Programm den Typ schon hat. exts = Windows (wie build/installer.nsh), mimes = Linux, utis = macOS
module.exports = {
  name: 'Picline',
  desktopId: 'win.mert.Picline.desktop',
  bundleId: 'win.mert.Picline',
  groups: [
    { id: 'png', label: { en: 'PNG images', de: 'PNG-Bilder' }, exts: ['png'], mimes: ['image/png'], utis: ['public.png'], primary: true },
    { id: 'jpg', label: { en: 'JPG photos', de: 'JPG-Fotos' }, exts: ['jpg', 'jpeg', 'jfif'], mimes: ['image/jpeg'], utis: ['public.jpeg'], primary: true },
    { id: 'webp', label: { en: 'WebP images', de: 'WebP-Bilder' }, exts: ['webp'], mimes: ['image/webp'], utis: ['org.webmproject.webp'], primary: true },
    { id: 'gif', label: { en: 'GIF images', de: 'GIF-Bilder' }, exts: ['gif'], mimes: ['image/gif'], utis: ['com.compuserve.gif'], primary: true },
    { id: 'bmp', label: { en: 'BMP images', de: 'BMP-Bilder' }, exts: ['bmp'], mimes: ['image/bmp'], utis: ['com.microsoft.bmp'], primary: true },
    { id: 'ico', label: { en: 'Icons (ICO, CUR)', de: 'Symbole (ICO, CUR)' }, exts: ['ico', 'cur'], mimes: ['image/x-icon', 'image/vnd.microsoft.icon'], utis: ['com.microsoft.ico'], primary: true },
    { id: 'avif', label: { en: 'AVIF images', de: 'AVIF-Bilder' }, exts: ['avif'], mimes: ['image/avif'], utis: ['public.avif'], primary: true },
    { id: 'picline', label: { en: 'Picline projects', de: 'Picline-Projekte' }, exts: ['picline'], mimes: ['application/x-picline'], utis: ['win.mert.picline.project'], primary: true },
  ],
};
