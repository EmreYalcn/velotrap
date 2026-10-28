# Changelog

All notable changes to **Velotrap** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.1.11] - 2026-10-28

### Added
- **Multi-language support (i18n)**: Full English (`en`) and Turkish (`tr`) localization with seamless live switching across the Desktop App and Chrome Extension.
- **Chrome Extension Sync**: Extension dynamically mirrors the app's selected language via bidirectional IPC and Chrome Storage.
- **Smart Link Detection**: Fallback page title sanitization (`getDisplayTabTitle`) to intelligently label browser internal pages as "Links" / "Bağlantılar".
- **Self-Healing Extension Installation Helper**: Embedded one-click installer and status notification in desktop settings.
- **Standalone macOS Packaging**: Portable Universal `.dmg` builder script with custom volume styling.

### Changed
- Refactored native companion bridge (`127.0.0.1:46890`) with resilient CORS and auto-reconnect fallback.
- Optimized 16x multi-thread chunk download buffer allocations for reduced CPU and RAM usage.
- Standardized UI typography and dark theme contrast.

### Fixed
- Fixed Dock icon label on macOS to display "Velotrap" rather than generic Electron identifier.
- Fixed black screen rendering issue on cold start with asynchronous window display synchronization.
- Resolved tab title override issue on `chrome://extensions/` tab.

---

## [3.0.0] - 2026-10-25

### Added
- High-speed 16-connection parallel chunk downloading engine.
- Integrated FFmpeg & yt-dlp backend with automatic binary acquisition.
- Chrome Manifest V3 companion extension with real-time network sniffing (.m3u8, .mp4, .ts).
- Floating video hover widget for instant 1-click downloads and 320kbps MP3 extraction.
