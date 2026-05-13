; ── Discord Updater – Installer Language Script ──────────────────────
; This script writes the chosen language to the app's config after install.
; electron-builder includes this via "include": "installer.nsh"

!macro customInstall
  ; Detect installer language and write to electron-store config
  ; electron-store saves to %APPDATA%\discord-updater\config.json
  
  ${If} $LANGUAGE == 1031
    ; German (de_DE)
    WriteRegStr HKCU "Software\discord-updater" "language" "de"
    
    ; Write language preference to a temp file that the app reads on first launch
    FileOpen $0 "$APPDATA\discord-updater-lang.tmp" w
    FileWrite $0 "de"
    FileClose $0
  ${Else}
    ; English (en_US) or any other language
    WriteRegStr HKCU "Software\discord-updater" "language" "en"
    
    FileOpen $0 "$APPDATA\discord-updater-lang.tmp" w
    FileWrite $0 "en"
    FileClose $0
  ${EndIf}
!macroend

!macro customUnInstall
  ; Clean up registry entries and temp files on uninstall
  DeleteRegKey HKCU "Software\discord-updater"
  Delete "$APPDATA\discord-updater-lang.tmp"
!macroend
