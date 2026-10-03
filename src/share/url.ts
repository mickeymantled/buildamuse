// Share link helpers. A link is a path plus a '#b=' hash, never a query string. The one query param
// the app knows is remix=1, which the Remix flow adds to a link. Pure: no window, no location.

import type { Build, BuildV1 } from '../compiler/types.js';
import { toShareHash } from './encode.js';

const REMIX_PARAM = 'remix';

export function shareUrl(origin: string, pathname: string, build: Build | BuildV1): string {
  return origin + pathname + toShareHash(build);
}

function parse(href: string): URL | undefined {
  try {
    return new URL(href);
  } catch {
    return undefined;
  }
}

// Same split as fromShareHash, so a payload that reads here decodes there.
function payloadOf(hash: string): string | undefined {
  const part = hash
    .replace(/^#/, '')
    .split('&')
    .find((p) => p.startsWith('b='));
  return part === undefined ? undefined : part.slice(2);
}

// An href that does not parse reads as an ordinary visit: no payload, no remix.
export function readLocation(href: string): { payload?: string; remix: boolean } {
  const url = parse(href);
  if (url === undefined) return { remix: false };
  const payload = payloadOf(url.hash);
  const remix = url.searchParams.get(REMIX_PARAM) === '1';
  return payload === undefined ? { remix } : { payload, remix };
}

// Origin and path only, per plan section 3 and W7: no query, no hash.
export function cleanHref(href: string): string {
  const url = parse(href);
  if (url === undefined) return href.split('#', 1)[0];
  return `${url.protocol}//${url.host}${url.pathname}`;
}
