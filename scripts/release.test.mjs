import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease } from './check-release.mjs';

test('accepts a matching stable version tag', () => {
  assert.doesNotThrow(() => checkRelease('refs/tags/v0.3.0', '0.3.0'));
});
test('rejects mismatched package versions', () => {
  assert.throws(() => checkRelease('refs/tags/v0.3.1', '0.3.0'), /must match/);
});
test('rejects branches, malformed tags, prereleases, and missing refs', () => {
  for (const ref of [undefined, 'refs/heads/v0.3.0', 'v0.3.0', 'refs/tags/v01.3.0', 'refs/tags/v0.3.0-beta.1', 'refs/tags/vfoo']) {
    assert.throws(() => checkRelease(ref, '0.3.0'), /stable/);
  }
});
