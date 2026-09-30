const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

test('Open Source Readiness: Required open-source and marketplace documentation files exist', () => {
  const requiredFiles = [
    'LICENSE',
    'README.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'CHROMEWEBSTORE.md',
    'FIREFOX_AMO.md',
    '.gitignore',
    'package.json',
    'manifest.json',
    'index.html',
    '.github/workflows/release.yml',
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(rootDir, file);
    assert.ok(fs.existsSync(filePath), `Required open-source file ${file} should exist`);
    const stats = fs.statSync(filePath);
    assert.ok(stats.size > 0, `File ${file} should not be empty`);
  }
});

test('Open Source Readiness: Version 0.0.1 is synchronized across manifest and package.json', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

  assert.equal(manifest.version, '0.0.1', 'manifest.json version must be 0.0.1');
  assert.equal(pkg.version, '0.0.1', 'package.json version must be 0.0.1');
  assert.equal(pkg.license, 'MIT', 'package.json license must be MIT');
});

test('Open Source Readiness: Zero hardcoded secrets / API keys in repository source files', () => {
  const sourceFiles = [
    'background.js',
    'content.js',
    'options/options.js',
    'popup/popup.js',
    'scripts/build_dist.js',
  ];

  // Pattern matching live API keys (OpenAI sk-..., Anthropic sk-ant-...)
  const liveSecretRegex = /sk-(proj|ant)-[a-zA-Z0-9_-]{20,}/;

  for (const file of sourceFiles) {
    const filePath = path.join(rootDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      liveSecretRegex.test(content),
      false,
      `File ${file} contains a potential hardcoded live secret key!`
    );
  }
});

test('Open Source Readiness: MIT License contains valid copyright holder', () => {
  const licenseContent = fs.readFileSync(path.join(rootDir, 'LICENSE'), 'utf8');
  assert.ok(licenseContent.includes('MIT License'), 'LICENSE should be MIT');
  assert.ok(licenseContent.includes('Emre Yılmaz'), 'LICENSE should contain author Emre Yılmaz');
});

test('Open Source Readiness: Manifest icons are properly sized and referenced', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));

  ['16', '48', '128'].forEach((size) => {
    const iconRelPath = manifest.icons[size];
    assert.ok(iconRelPath, `Icon ${size} should be declared in manifest`);
    const iconAbsPath = path.join(rootDir, iconRelPath);
    assert.ok(fs.existsSync(iconAbsPath), `Icon file ${iconRelPath} must exist on disk`);
  });
});

test('Open Source Readiness: Demo screenshot files exist for GitHub showcase', () => {
  const screenshots = ['diff-view-demo.png', 'side-by-side-demo.png', 'polished-text-demo.png'];
  for (const img of screenshots) {
    const imgPath = path.join(rootDir, img);
    assert.ok(fs.existsSync(imgPath), `Screenshot ${img} must exist`);
  }
});
