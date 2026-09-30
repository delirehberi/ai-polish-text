/**
 * Semantic Version Updater
 * Synchronizes versions across package.json, manifest.json, options.html, index.html, README.md, and dist/
 */

const fs = require('fs');
const path = require('path');
const { buildDistribution } = require('./build_dist.js');

const rootDir = path.resolve(__dirname, '..');

function parseSemver(versionStr) {
  const match = versionStr.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid semver format: "${versionStr}". Expected X.Y.Z`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

function bump(currentVersion, bumpType) {
  const semver = parseSemver(currentVersion);

  if (bumpType === 'patch') {
    semver.patch += 1;
  } else if (bumpType === 'minor') {
    semver.minor += 1;
    semver.patch = 0;
  } else if (bumpType === 'major') {
    semver.major += 1;
    semver.minor = 0;
    semver.patch = 0;
  } else if (/^\d+\.\d+\.\d+$/.test(bumpType)) {
    return bumpType;
  } else {
    throw new Error(`Unknown bump type: "${bumpType}". Must be 'patch', 'minor', 'major', or an explicit version like '1.2.0'.`);
  }

  return `${semver.major}.${semver.minor}.${semver.patch}`;
}

function updateProjectVersion(bumpType = 'patch') {
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;
  const newVersion = bump(currentVersion, bumpType);

  console.log(`Bumping version: ${currentVersion} -> ${newVersion} (${bumpType})`);

  // 1. Update package.json
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // 2. Update manifest.json
  const manifestPath = path.join(rootDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = newVersion;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  // 3. Update options/options.html
  const optionsHtmlPath = path.join(rootDir, 'options', 'options.html');
  if (fs.existsSync(optionsHtmlPath)) {
    let optionsHtml = fs.readFileSync(optionsHtmlPath, 'utf8');
    optionsHtml = optionsHtml.replace(/LLM Text Polisher v\d+\.\d+\.\d+/, `LLM Text Polisher v${newVersion}`);
    fs.writeFileSync(optionsHtmlPath, optionsHtml);
  }

  // 4. Update index.html
  const indexHtmlPath = path.join(rootDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    indexHtml = indexHtml.replace(/Download v\d+\.\d+\.\d+/, `Download v${newVersion}`);
    indexHtml = indexHtml.replace(/LLM Text Polisher v\d+\.\d+\.\d+/, `LLM Text Polisher v${newVersion}`);
    fs.writeFileSync(indexHtmlPath, indexHtml);
  }

  // 5. Update README.md
  const readmePath = path.join(rootDir, 'README.md');
  if (fs.existsSync(readmePath)) {
    let readme = fs.readFileSync(readmePath, 'utf8');
    readme = readme.replace(/badge\/version-\d+\.\d+\.\d+-blue\.svg/, `badge/version-${newVersion}-blue.svg`);
    fs.writeFileSync(readmePath, readme);
  }

  // 6. Rebuild distributions (dist/chrome and dist/firefox)
  buildDistribution();

  console.log(`Successfully updated version to ${newVersion} across all files.`);
  return newVersion;
}

if (require.main === module) {
  const arg = process.argv[2] || 'patch';
  updateProjectVersion(arg);
}

module.exports = {
  parseSemver,
  bump,
  updateProjectVersion,
};
