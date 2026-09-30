const test = require('node:test');
const assert = require('node:assert/strict');

const { parseSemver, bump } = require('../scripts/bump_version.js');

test('parseSemver extracts major, minor, patch accurately', () => {
  assert.deepEqual(parseSemver('0.0.1'), { major: 0, minor: 0, patch: 1 });
  assert.deepEqual(parseSemver('1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(parseSemver('10.20.30'), { major: 10, minor: 20, patch: 30 });
});

test('parseSemver throws on invalid versions', () => {
  assert.throws(() => parseSemver('v1.0'), /Invalid semver format/);
  assert.throws(() => parseSemver('1.0'), /Invalid semver format/);
  assert.throws(() => parseSemver('invalid'), /Invalid semver format/);
});

test('bump computes patch, minor, and major increments properly', () => {
  assert.equal(bump('0.0.1', 'patch'), '0.0.2');
  assert.equal(bump('0.0.9', 'patch'), '0.0.10');

  assert.equal(bump('0.0.1', 'minor'), '0.1.0');
  assert.equal(bump('0.5.9', 'minor'), '0.6.0');

  assert.equal(bump('0.0.1', 'major'), '1.0.0');
  assert.equal(bump('1.4.2', 'major'), '2.0.0');

  // Explicit version override
  assert.equal(bump('0.0.1', '1.5.0'), '1.5.0');
});
