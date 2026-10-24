const BUBBLE =
  "M168 112h176c42 0 76 34 76 76v92c0 42-34 76-76 76H252l-76 58c-6 5-14 1-14-6v-52h-6c-42 0-76-34-76-76v-92c0-42 34-76 76-76z";

export function AppIconSvg({ size, maskable = false, rounded = false }: { size: number; maskable?: boolean; rounded?: boolean }) {
  const glyph = maskable ? "translate(256 256) scale(0.78) translate(-250 -258)" : "translate(256 256) scale(0.94) translate(-250 -258)";
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="nx-bg" x1="40" y1="0" x2="470" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4fb0ff" />
          <stop offset="1" stopColor="#5a45e0" />
        </linearGradient>
        <linearGradient id="nx-play" x1="214" y1="184" x2="306" y2="284" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2b8cff" />
          <stop offset="1" stopColor="#6a52ec" />
        </linearGradient>
        <radialGradient id="nx-glow" cx="0.3" cy="0.08" r="0.75">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx={rounded ? 116 : 0} fill="url(#nx-bg)" />
      <rect width="512" height="512" rx={rounded ? 116 : 0} fill="url(#nx-glow)" />
      <g transform={glyph}>
        <path d={BUBBLE} fill="#1a1163" fillOpacity="0.3" transform="translate(0 16)" />
        <path d={BUBBLE} fill="#ffffff" />
        <path d="M224 190L224 278L302 234Z" fill="url(#nx-play)" stroke="url(#nx-play)" strokeWidth="26" strokeLinejoin="round" />
        <circle cx="414" cy="132" r="30" fill="#30d158" stroke="#5a5fe9" strokeWidth="12" />
      </g>
    </svg>
  );
}
