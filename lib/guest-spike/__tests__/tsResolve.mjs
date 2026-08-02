// ESM resolve hook for `node --experimental-strip-types --test`.
//
// Production sources must import extensionless (`./roomAllowlist`) — Next.js/webpack requires
// it and tsconfig rejects `.ts` specifiers without allowImportingTsExtensions. Node's own ESM
// resolver, however, needs a real filename, so any spec that transitively reaches an
// extensionless relative import dies with ERR_MODULE_NOT_FOUND. This hook bridges the two by
// retrying a failed relative resolution with `.ts`, then `.tsx`.
//
// Usage:  node --experimental-strip-types --import ./lib/guest-spike/__tests__/tsResolve.mjs \
//           --test lib/guest-spike/__tests__/*.spec.ts

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
        /* try the next extension, then rethrow the original error */
      }
    }
    throw err;
  }
}

register(import.meta.url, pathToFileURL('./'));
