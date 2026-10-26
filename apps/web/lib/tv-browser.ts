// Browsers built into TVs and set-top boxes (Samsung Tizen, LG webOS, HbbTV, Android TV, Fire TV, Roku...) draw video on a
// hardware layer. Anything blurred, faded or animated above that layer can make the picture disappear, so the TV page draws
// plain, opaque, instantly hidden overlays there.
export function isTvBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Tizen|SMART-TV|SmartTV|Web0S|WebOS|HbbTV|NetCast|VIDAA|Hisense|Roku|BRAVIA|CrKey|Chromecast|Viera|NETTV|SonyCE|PlayStation|Xbox|AndroidTV|Android.*\bTV\b/i.test(ua) || /\bAFT[A-Z]/.test(ua);
}
