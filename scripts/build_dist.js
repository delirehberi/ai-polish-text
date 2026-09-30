/**
 * Distribution Builder for Chrome & Firefox MV3
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const chromeDir = path.join(distDir, 'chrome');
const firefoxDir = path.join(distDir, 'firefox');

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === 'tests' || entry === 'scripts' || entry.endsWith('.zip') || entry === 'generate_icons.js') {
        continue;
      }
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function buildDistribution() {
  // Ensure target folders exist
  fs.rmSync(chromeDir, { recursive: true, force: true });
  fs.rmSync(firefoxDir, { recursive: true, force: true });
  fs.mkdirSync(chromeDir, { recursive: true });
  fs.mkdirSync(firefoxDir, { recursive: true });

  const rawBaseManifest = fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8');
  const baseManifest = JSON.parse(rawBaseManifest);

  // Files/Directories to copy
  const sharedItems = ['background.js', 'content.js', 'content.css', 'popup', 'options', 'icons'];

  for (const item of sharedItems) {
    const srcPath = path.join(rootDir, item);
    if (fs.existsSync(srcPath)) {
      copyRecursive(srcPath, path.join(chromeDir, item));
      copyRecursive(srcPath, path.join(firefoxDir, item));
    }
  }

  // Build Chrome Manifest
  const chromeManifest = {
    ...baseManifest,
    background: {
      service_worker: 'background.js',
    },
  };
  delete chromeManifest.browser_specific_settings;

  fs.writeFileSync(
    path.join(chromeDir, 'manifest.json'),
    JSON.stringify(chromeManifest, null, 2)
  );

  // Build Firefox Manifest
  const firefoxManifest = {
    ...baseManifest,
    background: {
      scripts: ['background.js'],
    },
    browser_specific_settings: {
      gecko: {
        id: 'ai-polish-text@emre.xyz',
        strict_min_version: '109.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  };

  fs.writeFileSync(
    path.join(firefoxDir, 'manifest.json'),
    JSON.stringify(firefoxManifest, null, 2)
  );

  console.log('Successfully built dist/chrome and dist/firefox distributions.');
}

if (require.main === module) {
  buildDistribution();
}

module.exports = { buildDistribution };
