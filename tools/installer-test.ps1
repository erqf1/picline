# Installer-Test (Windows, unsichtbar): Desktop-Symbol nur bei der Erst-Installation, Updates fassen es nie an,
# Deinstallieren entfernt es. Läuft in GitHub Actions (.github/workflows/test.yml), geht aber auch lokal:
#   npx electron-builder -w nsis --publish never
#   powershell -File tools/installer-test.ps1 [-Old <Picline-Setup-1.2.0.exe>]
# Achtung: installiert und deinstalliert Picline für den aktuellen Benutzer.
param([string]$Setup = '', [string]$Old = '')
$ErrorActionPreference = 'Stop'

if (-not $Setup) { $Setup = (Get-ChildItem dist\Picline-Setup-*.exe | Select-Object -First 1).FullName }
$desk = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desk 'Picline.lnk'
$dir = Join-Path $env:LOCALAPPDATA 'Programs\Picline'
$sh = New-Object -ComObject WScript.Shell
$fails = 0

function Check($name, $ok, $info = '') {
  if ($ok) { Write-Host "ok   $name $info" } else { Write-Host "FEHL $name $info"; $script:fails++ }
}
function Run($exe, [string[]]$arguments) {
  $p = Start-Process -FilePath $exe -ArgumentList $arguments -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "$exe $arguments -> Exitcode $($p.ExitCode)" }
}
function Uninstall {
  # der NSIS-Uninstaller kopiert sich nach %TEMP% und kehrt sofort zurück - warten, bis die Dateien weg sind
  Run (Join-Path $dir 'Uninstall Picline.exe') @('/S')
  for ($i = 0; $i -lt 120 -and (Test-Path (Join-Path $dir 'Picline.exe')); $i++) { Start-Sleep -Milliseconds 500 }
  Start-Sleep -Seconds 2
}
# Markierung in der Verknüpfung: bleibt sie, wurde das Symbol nicht neu angelegt (und bleibt an seinem Platz)
function Mark { $l = $sh.CreateShortcut($lnk); $l.Description = 'marker'; $l.Save() }
function Marked { (Test-Path $lnk) -and ($sh.CreateShortcut($lnk).Description -eq 'marker') }
function Aumi {
  $item = (New-Object -ComObject Shell.Application).NameSpace($desk).ParseName('Picline.lnk')
  if ($item) { $item.ExtendedProperty('System.AppUserModel.ID') } else { '' }
}
function Fresh {
  if (Test-Path (Join-Path $dir 'Uninstall Picline.exe')) { Uninstall }
  Remove-Item $lnk -ErrorAction SilentlyContinue
}

Write-Host "Setup: $Setup"
Fresh

# 1) Erst-Installation legt das Symbol an - mit Ziel und AppUserModelID der App
Run $Setup @('/S')
Check 'Erst-Installation: Desktop-Symbol da' (Test-Path $lnk)
Check 'Symbol zeigt auf Picline.exe' ($sh.CreateShortcut($lnk).TargetPath -eq (Join-Path $dir 'Picline.exe')) $sh.CreateShortcut($lnk).TargetPath
$id = Aumi
Check 'AppUserModelID der Verknüpfung' ($id -eq 'win.mert.Picline') "'$id'"

# 2) Update von Hand (Setup erneut starten) und 3) über die App (--updated): Symbol bleibt unberührt
Mark
Run $Setup @('/S')
Check 'Setup von Hand: Symbol nicht neu angelegt' (Marked)
Run $Setup @('--updated', '/S')
Check 'Update über die App: Symbol nicht neu angelegt' (Marked)

# 4) Gelöscht bleibt gelöscht
Remove-Item $lnk
Run $Setup @('/S')
Check 'Setup von Hand: gelöschtes Symbol kommt nicht wieder' (-not (Test-Path $lnk))
Run $Setup @('--updated', '/S')
Check 'Update über die App: gelöschtes Symbol kommt nicht wieder' (-not (Test-Path $lnk))

# 5) Deinstallieren entfernt das Symbol und die Einträge
Uninstall
Run $Setup @('/S')
Check 'nach Deinstallation wieder Erst-Installation' (Test-Path $lnk)
Uninstall
Check 'Deinstallieren entfernt das Symbol' (-not (Test-Path $lnk))
Check 'Deinstallieren entfernt die ProgIDs' (-not (Test-Path 'HKCU:\Software\Classes\Picline.png'))

# 6) Update von der alten Version (bis 1.2.0 legt deren Uninstaller das Symbol selbst an und löscht es beim Setup von Hand)
if ($Old) {
  Write-Host "Alte Version: $Old"
  Fresh
  Run $Old @('/S')
  Check 'alt installiert: Symbol da' (Test-Path $lnk)
  Mark
  Run $Setup @('--updated', '/S')
  Check 'alt -> neu über die App: Symbol nicht neu angelegt' (Marked)
  Uninstall
  Check 'Deinstallieren nach Update entfernt das Symbol' (-not (Test-Path $lnk))

  Run $Old @('/S')
  Run $Setup @('/S')
  Check 'alt -> neu von Hand: Symbol bleibt erhalten' (Test-Path $lnk)
  $id = Aumi
  Check 'alt -> neu von Hand: AppUserModelID' ($id -eq 'win.mert.Picline') "'$id'"
  Uninstall

  Run $Old @('/S')
  Remove-Item $lnk
  Run $Setup @('/S')
  Check 'alt -> neu von Hand: gelöschtes Symbol kommt nicht wieder' (-not (Test-Path $lnk))
  Uninstall
}

Write-Host ""
Write-Host "$fails fehlgeschlagen"
exit $fails
