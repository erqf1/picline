# Picline

Bildeditor im Stil von Paint 3D für Windows, Linux, macOS und den Browser: Pinsel, Pixelstift, Formen, Text, Ebenen und Effekte – mit Zoom bis aufs einzelne Pixel, auch für Minecraft-Texturen und Skins.

**[Releases](https://github.com/erqf1/picline/releases)** · **[Im Browser öffnen](https://mert.win/pic/app/)** · Lizenz: [MIT](LICENSE)

## Fertige Pakete

| System | Optionen |
| --- | --- |
| Windows | **Installer** (`Picline-Setup-*.exe`, trägt Picline bei „Öffnen mit“ für Bilder ein und fügt „Mit Picline bearbeiten“ ins Kontextmenü) oder **portabel** (`Picline-*-portable.exe`, keine Installation) |
| Linux | `.deb` (Debian/Ubuntu), `.pacman` (Arch) oder `.tar.gz` (portabel, jede Distribution) |
| macOS | `.zip` für Apple Silicon oder Intel (App-Bundle, immer portabel) |

Der Installer stellt **keine Standard-Programme** um: Fotos öffnen per Doppelklick weiter im gewohnten Betrachter. Nur die eigene Endung `.picline` bekommt Picline als Standard, und das auch nur, wenn dort noch nichts eingetragen ist. Wer Picline für einen Bildtyp als Standard will, wählt es einmal unter „Öffnen mit“ → „Immer“ – dann bekommt die Datei ein eigenes Symbol (hell oder dunkel, einstellbar).

### Linux

`.deb` und `.pacman` installieren sich wie gewohnt über den Paketmanager. Bei `.tar.gz`: entpacken, dann `./picline` ausführen. Startet die App mit einer Meldung zum „SUID sandbox helper“ nicht:

```bash
sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox   # empfohlen
./picline --no-sandbox                                                  # Notlösung, schwächere Isolation
```

### macOS

Die App ist **nicht signiert**. Einmalig nach dem Entpacken im Terminal:

```bash
xattr -cr Picline.app
codesign --force --deep --sign - Picline.app   # nötig auf Apple Silicon
```

## Was drin ist

- **Pinsel wie in Paint 3D:** rund (weich/hart), Marker, Kalligrafie, Spraydose, Bleistift – mit Stiftdruck.
- **Pixelstift** für Pixelgrafik: ganze Pixel, eckig oder rund, „Pixel-perfekt“ ohne Treppen-Ecken, **Spiegelmalen** (links/rechts, oben/unten, vierfach).
- **Radierer** (weich, hart, pixelgenau), **Füllen** mit Toleranz, **Pipette** (auch Alt+Klick).
- **Formen:** Linie, Pfeil, Rechteck, abgerundet, Ellipse, Dreieck, Stern, Sechseck, Herz, Sprechblase – danach noch verschieb-, skalier- und drehbar, auch pixelgenau.
- **Text** in jeder Schrift, fett/kursiv/unterstrichen, mit Hintergrund, auch ohne Kantenglättung.
- **Ebenen** mit Deckkraft, 16 Mischmodi, Sperren, Sortieren per Ziehen, Zusammenführen.
- **Auswahl** (Rechteck/Ellipse), Inhalt verschieben/skalieren/drehen, Screenshots einfügen, **Zuschneiden** mit Griffen und Seitenverhältnissen, Bild-/Leinwandgröße (mit „scharfen Pixeln“), drehen, spiegeln.
- **Effekte mit Live-Vorschau:** Helligkeit/Kontrast, Farbton/Sättigung, Graustufen, Umkehren, Sepia, Weichzeichnen, Schärfen, Rauschen, Verpixeln, Tontrennung, Schwarzweiß, Umriss.
- **Zoom 1 % bis 102 400 %**, Pixelraster, Raster alle N Pixel, Kachelvorschau für nahtlose Texturen.
- **Farben:** Farbfeld mit Deckkraft, Hex/RGB, Paletten (Standard, Minecraft-Farbstoffe, Pastell, Grautöne, Game Boy, PICO-8), zuletzt benutzte Farben.
- **Dateien:** öffnet PNG, JPG, WebP, GIF, BMP, ICO, AVIF, SVG; speichert PNG, JPG, WebP, BMP, ICO (alle Größen) und das Projektformat `.picline` (behält Ebenen).
- **12 Sprachen**, hell/dunkel mit eigener Akzentfarbe, Updates im Hintergrund.

## Tastenkürzel

Auf dem Mac ⌘ statt Strg. Werkzeuge: M Auswahl, V Verschieben, B Pinsel, P Pixelstift, E Radierer, G Füllen, I Pipette, U Formen, T Text, C Zuschneiden, H Hand, Z Zoom.

| Aktion | Taste |
| --- | --- |
| Neu / Öffnen / Speichern | Strg+N / Strg+O / Strg+S |
| Rückgängig / Wiederholen | Strg+Z / Strg+Y |
| Einfügen / als neue Ebene / als neues Bild | Strg+V / Strg+Shift+V / Strg+Alt+V |
| Alles auswählen / Auswahl aufheben | Strg+A / Strg+D |
| Bildgröße / Leinwandgröße | Strg+R / Strg+Shift+R |
| Einpassen / 100 % / Pixelraster | Strg+0 / Strg+1 / Strg+' |
| Farben tauschen / Schwarz-Weiß | X / D |
| Pinselgröße | [ ] |
| Ansicht verschieben | Leertaste oder Mitteltaste |
| Seitenpanel | Tab |
| Alle Kürzel | F1 |

## Selbst bauen

```bash
npm ci
npm start                      # bauen und starten
npm run build:win              # Windows-Installer + portabel nach dist/
node build.mjs --web           # Browser-Version nach site/app (wird zu mert.win/pic/app)
npx electron tools/make-icon.js        # App-Symbol neu erzeugen
python tools/make-filetype-icons.py    # Dateisymbole + build/installer.nsh
```

Selbsttest (malt unsichtbar mit echten Zeiger-Ereignissen, prüft Pixel, macht Bilder): `npx electron . --selftest <ordner>`. Bilder für die Website: `npx electron . --siteshots <ordner>`.
