// Test-only ESM resolve hook.
//
// Production modules must import extensionless (`./pollDiag`) — Next.js/webpack requires it and
// tsconfig rejects `.ts` specifiers. Node's own resolver needs a real filename, so any spec that
// transitively reaches such an import dies with ERR_MODULE_NOT_FOUND. This retries a failed
// relative resolution with `.ts`, then `.tsx`.
//
// Usage:
//   node --experimental-strip-types --import ./lib/chat/__tests__/tsResolve.mjs \
//     --test lib/chat/__tests__/pollDiag.spec.ts

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw err;
    for (const ext of ['.ts', '.tsx']) {
      try {
        return await nextResolve(specifier + ext, context);
      } catch {
        /* try next extension, then rethrow the original */
      }
    }
    throw err;
  }
}

register(import.meta.url, pathToFileURL('./'));
