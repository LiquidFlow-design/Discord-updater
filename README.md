# Discord Updater

Eine Electron-basierte Desktop-Anwendung zum einfachen Verwalten von Discord und BetterDiscord-Updates.

![Discord Updater](src/assets/icon.png)

## ✨ Features

- **System Tray** – Läuft unsichtbar im Hintergrund, immer erreichbar über das Tray-Icon
- **Autostart** – Optional beim Windows/macOS/Linux-Start ausführen
- **Automatische Update-Erkennung** – Erkennt Discord-Updates und aktualisiert BetterDiscord automatisch nach
- **Hintergrund-Prüfung** – Prüft regelmäßig (konfigurierbar) auf neue Versionen
- **Reparatur-Tools** – Discord reparieren, neu installieren oder BetterDiscord neu injizieren
- **Update-Verlauf** – Protokoll aller erkannten Updates und Aktionen
- **Desktop-Benachrichtigungen** – Informiert bei erkannten Updates
- **Discord-Design** – Minimalistisches UI in Discord-Farben

## 📦 Installation

### Voraussetzungen
- [Node.js](https://nodejs.org/) v18 oder höher
- npm (wird mit Node.js mitgeliefert)

### Schritt 1: Abhängigkeiten installieren
```bash
npm install
```

### Schritt 2: Starten (Entwicklung)
```bash
npm start
```

### Schritt 3: Installer bauen

**Windows:**
```batch
build.bat
```
oder:
```bash
npm run build
```

**macOS:**
```bash
npm run build:mac
```

**Linux:**
```bash
npm run build:linux
```

Der fertige Installer befindet sich im `dist/` Ordner.

## 🏗️ Projektstruktur

```
discord-updater/
├── src/
│   ├── main/
│   │   ├── main.js          # Electron Hauptprozess
│   │   └── preload.js       # Preload Bridge (IPC)
│   ├── renderer/
│   │   ├── index.html       # Haupt-UI
│   │   ├── style.css        # Discord-Design
│   │   └── app.js           # UI-Logik
│   └── assets/
│       ├── icon.png         # App-Icon (256x256)
│       └── tray-icon.png    # Tray-Icon (32x32)
├── package.json
├── build.bat                # Windows Build-Script
├── build.sh                 # Unix Build-Script
└── README.md
```

## ⚙️ Konfiguration

Alle Einstellungen werden in der App unter **Einstellungen** gespeichert:

| Einstellung | Standard | Beschreibung |
|-------------|----------|--------------|
| Autostart | Aus | Beim Systemstart starten |
| Im Tray minimieren | An | Beim Schließen in Tray minimieren |
| Benachrichtigungen | An | Desktop-Benachrichtigungen |
| BD Auto-Update | An | BetterDiscord nach Discord-Update nachziehen |
| Update-Intervall | 60 Min. | Hintergrund-Prüfintervall |

## 🔧 Technischer Hintergrund

### Discord-Erkennung
Die App sucht Discord in den Standard-Installationspfaden:
- **Windows:** `%LOCALAPPDATA%\Discord`, `DiscordCanary`, `DiscordPTB`
- **macOS:** `/Applications/Discord.app`
- **Linux:** `/usr/share/discord`, `~/.local/share/discord`

### Update-Erkennung
Discord wird auf Windows in `app-X.Y.Z` Ordner installiert. Die App vergleicht die aktuell gefundene Version mit der zuletzt gespeicherten. Bei Unterschied → Discord wurde aktualisiert.

### BetterDiscord
BD wird in `%APPDATA%\BetterDiscord` (Windows) installiert. Die App prüft die Injection in Discord's `index.js`.

## 📋 Anforderungen

- Windows 10+ / macOS 10.14+ / Ubuntu 18.04+
- Discord muss bereits installiert sein
- BetterDiscord muss separat installiert werden (https://betterdiscord.app/)

## 🔐 Sicherheit

- Die App führt keinen Code aus der Cloud aus
- Keine Daten werden extern übertragen
- Alle Einstellungen werden lokal gespeichert

## 📄 Lizenz

MIT License – Freie Nutzung und Modifikation erlaubt.
