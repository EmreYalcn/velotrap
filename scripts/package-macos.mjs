import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version || '3.1.7';

console.log(`[Packager] Packaging Velotrap v${version} for macOS (Apple Silicon & Intel)...`);

const releaseDir = path.join(rootDir, 'release');
const targetApp = path.join(releaseDir, 'Velotrap.app');
const electronSource = path.join(rootDir, 'node_modules', 'electron', 'dist', 'Velotrap.app');

if (!fs.existsSync(electronSource)) {
  console.error('[Packager] Source Velotrap.app not found in node_modules/electron/dist');
  process.exit(1);
}

// 1. Prepare clean release directory
fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });

console.log('[Packager] Copying base macOS application bundle...');
execSync(`cp -R "${electronSource}" "${targetApp}"`);

const resourcesDir = path.join(targetApp, 'Contents', 'Resources');
const defaultAppAsar = path.join(resourcesDir, 'default_app.asar');
if (fs.existsSync(defaultAppAsar)) {
  fs.rmSync(defaultAppAsar, { force: true });
}

// 2. Setup Resources/app
const appDir = path.join(resourcesDir, 'app');
fs.mkdirSync(appDir, { recursive: true });

console.log('[Packager] Copying compiled assets and extension...');
execSync(`cp -R "${path.join(rootDir, 'dist')}" "${appDir}/dist"`);
execSync(`cp -R "${path.join(rootDir, 'dist-electron')}" "${appDir}/dist-electron"`);
execSync(`cp -R "${path.join(rootDir, 'public')}" "${appDir}/public"`);
execSync(`cp -R "${path.join(rootDir, 'browser-extension')}" "${appDir}/browser-extension"`);

// Production package.json for the app
const prodPkg = {
  name: "velotrap",
  version: version,
  main: "dist-electron/main.js",
  description: "Velotrap Ultra-Fast Media & Download Manager"
};
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(prodPkg, null, 2), 'utf8');

// 3. Ensure Info.plist is fully polished
const infoPlistPath = path.join(targetApp, 'Contents', 'Info.plist');
let plist = fs.readFileSync(infoPlistPath, 'utf8');
plist = plist.replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleDisplayName</key>\n\t<string>Velotrap</string>');
plist = plist.replace(/<key>CFBundleName<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleName</key>\n\t<string>Velotrap</string>');
plist = plist.replace(/<key>CFBundleExecutable<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleExecutable</key>\n\t<string>Velotrap</string>');
plist = plist.replace(/<key>CFBundleIdentifier<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleIdentifier</key>\n\t<string>com.velotrap.app</string>');
plist = plist.replace(/<key>CFBundleShortVersionString<\/key>\s*<string>[^<]*<\/string>/, `<key>CFBundleShortVersionString</key>\n\t<string>${version}</string>`);
plist = plist.replace(/<key>CFBundleVersion<\/key>\s*<string>[^<]*<\/string>/, `<key>CFBundleVersion</key>\n\t<string>${version}</string>`);
fs.writeFileSync(infoPlistPath, plist, 'utf8');

// 4. Ensure permissions
execSync(`chmod +x "${path.join(targetApp, 'Contents', 'MacOS', 'Velotrap')}"`);

// Strip quarantine attribute if macOS added any
try {
  execSync(`xattr -cr "${targetApp}" 2>/dev/null || true`);
} catch {}

console.log(`[Packager] Successfully built standalone app at: ${targetApp}`);

// 5. Create macOS DMG Installer
const dmgStaging = path.join(releaseDir, 'dmg-staging');
fs.mkdirSync(dmgStaging, { recursive: true });

execSync(`cp -R "${targetApp}" "${dmgStaging}/Velotrap.app"`);
execSync(`ln -s /Applications "${dmgStaging}/Applications"`);

const dmgPath = path.join('/Users/emre/Desktop', `Velotrap_${version}.dmg`);
console.log(`[Packager] Creating Apple DMG disk image installer at: ${dmgPath}...`);

try {
  if (fs.existsSync(dmgPath)) fs.rmSync(dmgPath, { force: true });
  execSync(`hdiutil create -volname "Velotrap" -srcfolder "${dmgStaging}" -ov -format UDZO "${dmgPath}"`);
  console.log(`[Packager] ✓ DMG installer created successfully!`);
} catch (dmgErr) {
  console.error('[Packager] Error creating DMG:', dmgErr.message);
}

// 6. Also copy Velotrap.app directly to /Applications so it's immediately installed and ready
const sysAppPath = '/Applications/Velotrap.app';
try {
  console.log(`[Packager] Installing Velotrap.app to /Applications/Velotrap.app...`);
  fs.rmSync(sysAppPath, { recursive: true, force: true });
  execSync(`cp -R "${targetApp}" "${sysAppPath}"`);
  console.log(`[Packager] ✓ Installed to /Applications/Velotrap.app!`);
} catch (instErr) {
  console.warn('[Packager] Could not copy to /Applications (needs permission):', instErr.message);
}

console.log('[Packager] All packaging tasks completed!');
