// Browsers built into TVs (Samsung Tizen, LG webOS, HbbTV sets) draw video on a hardware layer. Anything blurred, faded or
// animated above that layer can make the picture disappear, so the TV page draws plain, solid, instantly hidden overlays there.
export function isTvBrowser() {
  return typeof navigator !== "undefined" && /Tizen|SMART-TV|SmartTV|Web0S|WebOS|HbbTV|NetCast|VIDAA|Hisense|Roku|AFT[A-Z]/i.test(navigator.userAgent);
}
