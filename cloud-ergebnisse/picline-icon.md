ERGEBNIS CLOUD-SESSION picline-icon

1. Aufgabe und Status
- Patch-Release Picline 1.2.1: Desktop-Symbol nur bei Erst-Installation + mehr Website-Bilder.
- Code fertig, Version 1.2.1 gesetzt. NICHT released: kein Tag gepusht (Cloud darf nur auf den eigenen Branch pushen) -> PR nach main.

2. Branch, Commits, PR, Release, CI
- Branch: claude/friendly-curie-921fky
- Commits: d971eb2 (1.2.1 Hauptänderung), e006f92 (Selbsttest: relativer Ordner, Zeitlimit), 1059f59 (Selbsttest: Cmd auf Mac, Farbtoleranz Windows)
- PR: siehe PR-Link in der Antwort der Cloud-Session (erqf1/picline, Branch -> main)
- Release-Tag: keiner (v1.2.1 noch anlegen, siehe Punkt 5)
- CI (neuer Workflow "Test", Run 44599204461 auf 1059f59): alle 4 Jobs grün - Selbsttest Windows, Linux, macOS + Installer-Test Windows. Release-Workflow nicht gelaufen (kein Tag).

3. Was geändert wurde
- package.json: createDesktopShortcut false, Version 1.2.1.
- build/installer.nsh (+ Generator tools/make-filetype-icons.py, jetzt wieder gleich, inkl. Capabilities aus 1.2.0):
  customInit merkt, ob Desktop\Picline.lnk existiert; customInstall legt das Symbol nur an, wenn Picline vorher nicht installiert war (keine Picline.png-ProgID, kein --updated); respektiert --no-desktop-shortcut; AppUserModelID win.mert.Picline per WinShell::SetLnkAUMI.
  Updates (electron-updater und von Hand gestartetes Setup) fassen das Symbol nicht an; gelöscht bleibt gelöscht.
  Sonderfall Update von 1.2.0 per Setup von Hand: der alte Uninstaller löscht das Symbol noch selbst -> wird einmalig neu angelegt (Position kann sich dabei ein letztes Mal ändern).
  customUnInstall entfernt das Symbol nur beim echten Deinstallieren (nicht bei isUpdated).
- Linux/macOS geprüft: kein Desktop-Symbol (deb/pacman nur .desktop in /usr/share/applications, tar.gz/zip nichts) -> keine Änderung nötig.
- src/main.js: --selftest/--siteshots akzeptieren relative Ordner (vorher Absturz/Hänger).
- Seitenpanel-Kacheln: Spalten minmax(0,1fr) + Umbruch, deutsche Trennstellen (Weich-zeichnen, Schwarz-weiß, Leinwand-größe, Abge-rundetes, Sprech-blase) -> kein horizontaler Scrollbalken mehr bei breiten Schriften (Linux/macOS).
- tools/siteshots.js: 15 Szenen x en/de = 30 Bilder; Effekt-Bild mit Farbton -60 (kein Orange neben Grün mehr).
- tools/webp.py (PNG -> WebP), tools/installer-test.ps1, .github/workflows/test.yml (Selbsttest Win/Linux/macOS + Installer-Test Windows).
- website-updates/: img/*.webp (30 Bilder, 1440x900, je 30-60 KB), changelog-1.2.1.html, README.md (Übersicht der Bilder).

4. Was getestet wurde
- NSIS-Installer + Uninstaller lokal kompiliert (makensis -WX, ohne Warnungen).
- Installer-Test auf echtem Windows-Runner grün: Erst-Installation legt Symbol an (Ziel + AppUserModelID stimmen); Setup von Hand und --updated legen es nicht neu an (Markierung bleibt); gelöschtes Symbol kommt nicht wieder; Deinstallieren entfernt Symbol und ProgIDs; Update von echter 1.2.0 (über App: unberührt; von Hand: bleibt erhalten; gelöscht: bleibt weg).
- Selbsttest 26/26 ok lokal (Linux, xvfb) und in CI auf Windows, Linux und macOS (vorher in CI nie gelaufen; zwei alte Testschwächen behoben: Strg statt Cmd auf dem Mac, Grün 129 statt 128 unter Windows).
- Nicht getestet: Installation "Für alle Benutzer" (HKLM/Public Desktop), sichtbare Desktop-Position auf echtem Rechner, Release-Build (electron-builder --publish always).

5. Offene Punkte / was der Nutzer tun muss
- PR nach main mergen (CI grün).
- Release: auf main "git tag v1.2.1 && git push origin v1.2.1" (oder Release-Workflow starten), danach prüfen, dass alle Pakete dran sind (Setup.exe + blockmap + latest.yml, portable.exe, deb, pacman, tar.gz, 2x mac zip, latest-linux.yml, latest-mac.yml).
- Release-Notizen (kurz): "Picline 1.2.1: Das Desktop-Symbol bleibt bei Updates an seinem Platz und wird nur noch bei der ersten Installation angelegt. Mehr dazu: https://mert.win/pic/changelog.html"
- Wer von 1.2.0 per Setup von Hand aktualisiert, sieht das Symbol evtl. ein letztes Mal an neuer Stelle; ab 1.2.1 nicht mehr.

6. Nächste Schritte für die Haupt-Session
- website-updates/img/*.webp nach Websites/pic/img übernehmen und auf der Seite einbauen (Übersicht in website-updates/README.md; -de/-en je Sprache).
- website-updates/changelog-1.2.1.html oben in Websites/pic/changelog.html einfügen (Klassen an das vorhandene Markup anpassen).
- Gleiche Desktop-Symbol-Logik in den anderen Line-Programmen übernehmen (build/installer.nsh: customInit/customInstall/customUnInstall, createDesktopShortcut false, tools/installer-test.ps1 + test.yml).
