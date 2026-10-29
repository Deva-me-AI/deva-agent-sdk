import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const temp = mkdtempSync(join(tmpdir(), 'deva-pack-'));
const run = (command, args, options = {}) => execFileSync(command, args, {
  encoding: 'utf8', timeout: 120_000, ...options,
});
try {
  run('npm', ['pack', '--pack-destination', temp]);
  const tarballs = readdirSync(temp).filter(name => name.endsWith('.tgz'));
  assert.equal(tarballs.length, 1);
  const [filename] = tarballs;
  writeFileSync(join(temp, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temp, filename)], { cwd: temp });
  run(process.execPath, ['--input-type=module', '-e', "import assert from 'node:assert/strict'; import { DevaClient, DevaAgent } from '@deva-me/agent-sdk'; assert.equal(typeof DevaClient, 'function'); assert.equal(typeof DevaAgent, 'function');"], { cwd: temp });
  run(process.execPath, ['-e', "const assert = require('node:assert/strict'); const { DevaClient, DevaAgent } = require('@deva-me/agent-sdk'); assert.equal(typeof DevaClient, 'function'); assert.equal(typeof DevaAgent, 'function');"], { cwd: temp });
  console.log('Packed package smoke test passed');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
