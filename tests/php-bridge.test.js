const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { ensurePhpBootstrapFile, server } = require('../home-page/server.js');

test('ensures the PHP bootstrap lives in the project bridge directory', () => {
  const bootstrapPath = path.resolve(__dirname, '..', 'php-bridge', 'bootstrap.php');
  const resolvedPath = ensurePhpBootstrapFile();

  assert.equal(resolvedPath, bootstrapPath);
  assert.ok(fs.existsSync(bootstrapPath), 'expected bootstrap file to be created at the project path');
  assert.match(fs.readFileSync(bootstrapPath, 'utf8'), /<\?php/);
});

test.after(() => {
  if (server && typeof server.close === 'function') {
    server.close();
  }
});
