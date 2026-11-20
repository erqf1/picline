# Website-Updates Picline 1.2.1

Für `Websites/pic` (mert.win/pic) – die Website liegt nicht in diesem Repo.

- `changelog-1.2.1.html`: Eintrag für `changelog.html`, oben einfügen.
- `img/*.webp`: 30 echte Bilder (1440 × 900), unsichtbar erzeugt mit `npx electron . --siteshots` und `tools/webp.py`.
  Je Szene `-en` und `-de`:

| Datei | Zeigt |
| --- | --- |
| `pixel` | Pixelgrafik 16 × 16 mit Raster, Pixelstift, PICO-8-Palette |
| `paint` | Malen mit dem Pinsel auf einem Sonnenuntergang |
| `brushes` | Pinsel-Stile: rund, Marker, Kalligrafie, Spraydose, Bleistift |
| `shapes` | Formen (Rechteck, Ellipse, Dreieck, Sechseck, Pfeil, Stern, Sprechblase, Herz), die letzte noch verschiebbar |
| `text` | Text tippen mit Text-Panel |
| `layers` | Mehrere Ebenen, Form wird gedreht/verschoben |
| `layers-panel` | Ebenen-Panel mit Mischmodus „Ineinanderkopieren“ |
| `effects` | Farbton/Sättigung mit Live-Vorschau |
| `crop` | Zuschneiden mit 16:9-Rahmen |
| `export` | Menü Datei › Exportieren als (PNG, JPG, WebP, BMP, ICO, Projekt) |
| `settings` | Einstellungen: Sprache, hell/dunkel, Stil, Akzentfarbe |
| `light` | Helles Design |
| `acryl-dark`, `acryl-light` | Stil Acryl dunkel und hell |
| `view` | Ansehen-Modus (geöffnetes Bild ohne Werkzeuge) |
