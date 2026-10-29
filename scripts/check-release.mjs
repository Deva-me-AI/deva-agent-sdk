import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function checkRelease(ref, version) {
  if (!/^refs\/tags\/v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(ref ?? '')) {
    throw new Error('Release requires a stable vX.Y.Z tag');
  }
  if (ref !== `refs/tags/v${version}`) {
    throw new Error('Tag must match package.json version');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkRelease(process.env.GITHUB_REF, JSON.parse(readFileSync('package.json', 'utf8')).version);
}
