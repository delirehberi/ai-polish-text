const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { buildDistribution } = require('../scripts/build_dist.js');

test('buildDistribution creates valid separate dist/chrome and dist/firefox outputs', () => {
  buildDistribution();

  const distDir = path.resolve(__dirname, '..', 'dist');
  const chromeManifestPath = path.join(distDir, 'chrome', 'manifest.json');
  const firefoxManifestPath = path.join(distDir, 'firefox', 'manifest.json');

  assert.ok(fs.existsSync(chromeManifestPath), 'dist/chrome/manifest.json should exist');
  assert.ok(fs.existsSync(firefoxManifestPath), 'dist/firefox/manifest.json should exist');

  const chromeManifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf8'));
  const firefoxManifest = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf8'));

  // Chrome specific checks
  assert.equal(chromeManifest.background.service_worker, 'background.js');
  assert.equal(chromeManifest.browser_specific_settings, undefined);

  // Firefox specific checks
  assert.deepEqual(firefoxManifest.background.scripts, ['background.js']);
  assert.equal(firefoxManifest.browser_specific_settings.gecko.id, 'llm-text-polisher@workouse.com');

  // Verify critical assets in both
  ['background.js', 'content.js', 'content.css', 'popup/popup.html', 'options/options.html', 'icons/icon-128.png'].forEach((file) => {
    assert.ok(fs.existsSync(path.join(distDir, 'chrome', file)), `dist/chrome/${file} should exist`);
    assert.ok(fs.existsSync(path.join(distDir, 'firefox', file)), `dist/firefox/${file} should exist`);
  });
});
