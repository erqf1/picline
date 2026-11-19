; Erzeugt von tools/make-filetype-icons.py aus tools/filetypes.json - nicht von Hand ändern.
; Windows: Picline unter "Öffnen mit" für Bilder (je Typ eine ProgID mit eigenem Dateisymbol) und "Mit Picline bearbeiten"
; im Kontextmenü von Bildern. UserChoice und die Standard-App fremder Typen fasst Picline nie an.
; SHCTX = HKCU bei "Nur für mich" (Standard), HKLM nur bei "Für alle Benutzer".

; Typen unter "Öffnen mit": Endung, Symbol/ProgID

!macro piclineTypes CMD
  !insertmacro ${CMD} "png" "png"
  !insertmacro ${CMD} "jpg" "jpg"
  !insertmacro ${CMD} "jpeg" "jpg"
  !insertmacro ${CMD} "jfif" "jpg"
  !insertmacro ${CMD} "webp" "webp"
  !insertmacro ${CMD} "gif" "gif"
  !insertmacro ${CMD} "bmp" "bmp"
  !insertmacro ${CMD} "ico" "ico"
  !insertmacro ${CMD} "cur" "ico"
  !insertmacro ${CMD} "avif" "avif"
  !insertmacro ${CMD} "picline" "picline"
!macroend

!macro piclineProgIds CMD
  !insertmacro ${CMD} "png"
  !insertmacro ${CMD} "jpg"
  !insertmacro ${CMD} "webp"
  !insertmacro ${CMD} "gif"
  !insertmacro ${CMD} "bmp"
  !insertmacro ${CMD} "ico"
  !insertmacro ${CMD} "avif"
  !insertmacro ${CMD} "picline"
!macroend

; eigene Endungen (Standard-App, wenn noch keine eingetragen ist)

!macro piclineOwn CMD
  !insertmacro ${CMD} "picline"
!macroend

; Schlüssel löschen, wenn er ganz leer ist (keine Unterschlüssel, keine Werte, auch kein Standardwert)
!macro piclineDeleteIfEmpty ROOT KEY
  Push $R1
  ClearErrors
  EnumRegKey $R1 ${ROOT} "${KEY}" 0
  ${IfNot} ${Errors}
  ${AndIf} $R1 == ""
    ClearErrors
    EnumRegValue $R1 ${ROOT} "${KEY}" 0
    ${If} ${Errors}
      DeleteRegKey ${ROOT} "${KEY}"
    ${EndIf}
  ${EndIf}
  Pop $R1
!macroend

!macro piclineAddProgId NAME
  WriteRegStr SHCTX "Software\Classes\Picline.${NAME}" "" "Picline"
  WriteRegStr SHCTX "Software\Classes\Picline.${NAME}\DefaultIcon" "" "$INSTDIR\resources\filetypes\light\${NAME}.ico"
  WriteRegStr SHCTX "Software\Classes\Picline.${NAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro piclineRemoveProgId NAME
  DeleteRegKey SHCTX "Software\Classes\Picline.${NAME}"
  ; Picline kann das Symbol (hell/dunkel) für den Benutzer umgestellt haben
  DeleteRegKey HKCU "Software\Classes\Picline.${NAME}"
!macroend

; Nur die ProgID unter "Öffnen mit" - kein Applications\Picline.exe\SupportedTypes (sonst nimmt Windows für alle Typen
; das Programmsymbol). Dazu "Mit Picline bearbeiten" im Kontextmenü des Typs.
!macro piclineAddType EXT NAME
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "Picline.${NAME}" ""
  ; für "Standard-Apps" in den Windows-Einstellungen
  WriteRegStr SHCTX "Software\Picline\Capabilities\FileAssociations" ".${EXT}" "Picline.${NAME}"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\Picline" "" "$1"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\Picline" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\Picline\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro piclineRemoveType EXT NAME
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "Picline.${NAME}"
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "Picline.${NAME}"
  !insertmacro piclineDeleteIfEmpty SHCTX "Software\Classes\.${EXT}\OpenWithProgids"
  !insertmacro piclineDeleteIfEmpty SHCTX "Software\Classes\.${EXT}"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\Picline"
  !insertmacro piclineDeleteIfEmpty SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell"
  !insertmacro piclineDeleteIfEmpty SHCTX "Software\Classes\SystemFileAssociations\.${EXT}"
!macroend

; eigene Endung (.picline): Standardwert nur setzen, wenn er leer ist
!macro piclineAddOwn EXT
  Push $R1
  ReadRegStr $R1 SHCTX "Software\Classes\.${EXT}" ""
  ${If} $R1 == ""
    WriteRegStr SHCTX "Software\Classes\.${EXT}" "" "Picline.${EXT}"
  ${EndIf}
  Pop $R1
!macroend

!macro piclineRemoveOwn EXT
  Push $R1
  ReadRegStr $R1 SHCTX "Software\Classes\.${EXT}" ""
  ${If} $R1 == "Picline.${EXT}"
    DeleteRegValue SHCTX "Software\Classes\.${EXT}" ""
  ${EndIf}
  !insertmacro piclineDeleteIfEmpty SHCTX "Software\Classes\.${EXT}"
  Pop $R1
!macroend

; Desktop-Symbol: createDesktopShortcut ist aus, Picline legt es selbst an - nur bei der Erst-Installation. Ein Update
; (über die App oder ein von Hand gestartetes Setup) fasst es nie an: Es bleibt an seinem Platz, und wer es gelöscht hat,
; bekommt es nicht zurück. Entfernt wird es nur beim echten Deinstallieren.
!macro customInit
  ; vor dem Deinstallieren der alten Version merken, ob es ein Desktop-Symbol gab (bis 1.2.0 löscht der alte
  ; Uninstaller es bei einem von Hand gestarteten Setup - dann einmal neu anlegen statt es verschwinden zu lassen)
  Var /GLOBAL piclineHadDesktopLink
  StrCpy $piclineHadDesktopLink "0"
  ${If} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
    StrCpy $piclineHadDesktopLink "1"
  ${EndIf}
!macroend

!macro piclineCreateDesktopLink
  CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  ; gleiche AppUserModelID wie die App (app.setAppUserModelId) - sonst zeigt die Taskleiste ein zweites Symbol
  WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
!macroend

; WASINSTALLED: Standardwert einer Picline-ProgID vor diesem Setup - nicht leer, wenn Picline schon installiert war
; (die ProgIDs überleben ein Update, der alte Uninstaller läuft dabei immer mit --updated)
!macro piclineDesktopLink WASINSTALLED
  Push $R1
  Push $R2
  ${GetParameters} $R1
  ClearErrors
  ${GetOptions} $R1 "--no-desktop-shortcut" $R2
  ${If} ${Errors}
    ${If} ${WASINSTALLED} == ""
    ${AndIfNot} ${isUpdated}
      ; Erst-Installation
      ${IfNot} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
        !insertmacro piclineCreateDesktopLink
      ${EndIf}
    ${ElseIf} $piclineHadDesktopLink == "1"
    ${AndIfNot} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
      ; Update von 1.2.0 oder älter: der alte Uninstaller hat das Symbol eben gelöscht
      !insertmacro piclineCreateDesktopLink
    ${EndIf}
  ${EndIf}
  ClearErrors
  Pop $R2
  Pop $R1
!macroend

!macro customInstall
  Push $1
  Push $2
  ReadRegStr $2 SHCTX "Software\Classes\Picline.png" ""
  StrCpy $1 "Edit with Picline"
  ${If} $LANGUAGE == 1031
    StrCpy $1 "Mit Picline bearbeiten"
  ${EndIf}
  !insertmacro piclineProgIds piclineAddProgId
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "Picline"
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  DeleteRegKey SHCTX "Software\Picline\Capabilities\FileAssociations"
  !insertmacro piclineTypes piclineAddType
  WriteRegStr SHCTX "Software\Picline\Capabilities" "ApplicationName" "Picline"
  WriteRegStr SHCTX "Software\Picline\Capabilities" "ApplicationDescription" "Paint, pixel, crop"
  WriteRegStr SHCTX "Software\Picline\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHCTX "Software\RegisteredApplications" "Picline" "Software\Picline\Capabilities"
  !insertmacro piclineOwn piclineAddOwn
  !insertmacro piclineDesktopLink $2
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  Pop $2
  Pop $1
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    !insertmacro piclineOwn piclineRemoveOwn
    !insertmacro piclineTypes piclineRemoveType
    !insertmacro piclineProgIds piclineRemoveProgId
    DeleteRegKey SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
    DeleteRegKey SHCTX "Software\Picline\Capabilities"
    DeleteRegKey /ifempty SHCTX "Software\Picline"
    DeleteRegValue SHCTX "Software\RegisteredApplications" "Picline"
    ; Desktop-Symbol nur beim echten Deinstallieren entfernen, nie bei einem Update
    ${If} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
      WinShell::UninstShortcut "$DESKTOP\${SHORTCUT_NAME}.lnk"
      Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ${EndIf}
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${endIf}
!macroend
