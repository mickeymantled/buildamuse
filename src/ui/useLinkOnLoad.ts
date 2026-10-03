// Opens a share link once, when the app starts. The address bar is read here and then cleaned,
// so the build never lingers in history. There is no hashchange listener and no address-bar sync (W7).

import { useLayoutEffect } from 'react';
import library from '../library/index.js';
import { fromShareHash } from '../share/encode.js';
import { cleanHref, readLocation } from '../share/url.js';
import { useBuilder } from './store.js';

const UNKNOWN_FAILURE = 'link could not be opened';

// Reads window.location. A visit with no payload does nothing. A payload loads as a link, or as a
// link remix when the address has remix=1. A payload that fails to decode sets linkError, and the
// app shows the link error view. Either way the address bar is cleaned afterwards.
export function openLinkFromLocation(): void {
  const { payload, remix } = readLocation(window.location.href);
  if (payload === undefined) return;
  try {
    const { build, warnings, drops } = fromShareHash(`b=${payload}`, library);
    useBuilder.getState().loadBuild(build, { from: remix ? 'link-remix' : 'link', warnings, drops });
  } catch (e) {
    // Kept for debugging. The link error view does not print it.
    useBuilder.setState({ linkError: e instanceof Error && e.message ? e.message : UNKNOWN_FAILURE });
  }
  try {
    window.history.replaceState(null, '', cleanHref(window.location.href));
  } catch {
    // A sandboxed frame can refuse replaceState. The link is loaded either way.
  }
}

// A layout effect, so the opened build is in place before the first paint and the target screen never flashes.
export function useLinkOnLoad(): void {
  useLayoutEffect(() => {
    openLinkFromLocation();
  }, []);
}
