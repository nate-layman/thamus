// Key manager, the same shape as Data Crawler Carl's and Promptulus's: read ?key=
// from the URL once, keep it in sessionStorage, strip it from the address bar.
// sessionStorage is scoped to this tab, cleared when the tab closes, never written to disk.

const STORAGE_KEY = 'thamus_key';

export function getKey() {
  try { return sessionStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

export function setKey(k) {
  try {
    if (k) sessionStorage.setItem(STORAGE_KEY, k);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* private window with storage blocked: the key lives only in memory */ }
}

let loadedFromURL = false;

export function wasKeyLoadedFromURL() {
  return loadedFromURL;
}

export function readKeyFromURL() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('key');
  if (key) {
    setKey(key.trim());
    loadedFromURL = true;
    const cleanUrl = new URL(window.location);
    cleanUrl.searchParams.delete('key');
    window.history.replaceState({}, '', cleanUrl);
  }
  return getKey();
}
