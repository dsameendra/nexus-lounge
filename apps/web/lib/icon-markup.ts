export function iconMarkup({ size = 512, maskable = false, rounded = false }: { size?: number; maskable?: boolean; rounded?: boolean } = {}) {
  const corner = rounded ? 116 : 0;
  const glyph = `translate(256 256) scale(${maskable ? 0.74 : 0.94}) translate(-320 -256)`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
<defs>
<radialGradient id="nx-bg" cx="0.5" cy="0.3" r="0.95"><stop offset="0" stop-color="#2a2a5c"/><stop offset="0.5" stop-color="#13132d"/><stop offset="1" stop-color="#07070f"/></radialGradient>
<linearGradient id="nx-mark" x1="140" y1="110" x2="470" y2="400" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#62d4ff"/><stop offset="0.5" stop-color="#1a8cff"/><stop offset="1" stop-color="#c35cf4"/></linearGradient>
<linearGradient id="nx-sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<radialGradient id="nx-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#1a8cff" stop-opacity="0.45"/><stop offset="1" stop-color="#1a8cff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="512" height="512" rx="${corner}" fill="url(#nx-bg)"/>
<rect width="512" height="512" rx="${corner}" fill="url(#nx-sheen)"/>
<g transform="${glyph}">
<circle cx="250" cy="256" r="210" fill="url(#nx-glow)"/>
<path d="M184 152L184 360L342 256Z" fill="url(#nx-mark)" stroke="url(#nx-mark)" stroke-width="46" stroke-linejoin="round"/>
<path d="M392 200A70 70 0 0 1 392 312" fill="none" stroke="url(#nx-mark)" stroke-width="30" stroke-linecap="round"/>
<path d="M432 162A112 112 0 0 1 432 350" fill="none" stroke="url(#nx-mark)" stroke-width="30" stroke-linecap="round" stroke-opacity="0.62"/>
</g>
</svg>`;
}

export function iconDataUri(options: Parameters<typeof iconMarkup>[0]) {
  return `data:image/svg+xml;base64,${Buffer.from(iconMarkup(options)).toString("base64")}`;
}
