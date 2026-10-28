# Contributing to Velotrap

Thank you for your interest in contributing to **Velotrap**! We welcome bug reports, feature requests, documentation improvements, and code contributions from everyone.

---

## Code of Conduct

By participating in this project, you agree to treat everyone with respect, kindness, and professionalism.

---

## Development Setup

### Prerequisites
- **Node.js**: v18.0.0 or later (or [Bun](https://bun.sh) v1.0+)
- **npm** or **bun**
- **Git**
- Optional: **FFmpeg** (installed via Homebrew or system package manager)

### 1. Clone the repository
```bash
git clone https://github.com/velotrap/velotrap.git
cd velotrap
```

### 2. Install dependencies
```bash
# Using bun (recommended)
bun install

# Or using npm
npm install
```

### 3. Run in development mode
```bash
# Start Vite development server & Electron
bun run dev:vite
bun run build:electron
bun start
```

### 4. Running tests
```bash
bun test
# or
npm test
```

---

## Loading the Chrome Extension in Development

1. Open Google Chrome (or any Chromium browser: Brave, Edge, Opera, Arc).
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked** and select the `browser-extension/` directory from this repository.
5. Launch Velotrap Desktop — the extension status badge will automatically turn green (`Connected` / `Bağlı`).

---

## Pull Request Guidelines

1. **Fork the repo** and create your branch from `main`:
   ```bash
   git checkout -b feature/my-new-feature
   ```
2. **Write clean, typed TypeScript code**: Ensure `bun run build:electron` and `bun run build:vite` succeed without errors.
3. **Keep i18n in sync**: If you add new strings, update both `src/i18n/translations.ts` and `browser-extension/popup.js` / `content.js` in Turkish and English.
4. **Run tests**:
   ```bash
   node --test tests/engine.test.mjs
   ```
5. **Commit with descriptive messages** following conventional commits:
   - `feat: add bandwidth throttling graph`
   - `fix: resolve stream sniffing on blob URLs`
   - `docs: update extension installation guide`
6. **Open a Pull Request** describing what your changes do and any testing performed.

Thank you for helping make Velotrap faster, better, and open for all!
