// The Android app accepts WebView 80+ (capacitor.config.json minWebViewVersion). The bundle's syntax
// targets es2020, but a few newer built-ins used by the app need filling in on WebView 80–91.

function at(index) {
  const n = Math.trunc(index) || 0;
  const i = n < 0 ? this.length + n : n;
  return i < 0 || i >= this.length ? undefined : this[i];
}

for (const proto of [Array.prototype, String.prototype, Object.getPrototypeOf(Int8Array.prototype)]) {
  if (!proto.at) Object.defineProperty(proto, 'at', { value: at, writable: true, configurable: true });
}
