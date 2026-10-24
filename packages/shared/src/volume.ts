export const SILENT_BELOW = 0.04;

export function sliderToGain(slider: number) {
  const value = Math.min(1, Math.max(0, Number.isFinite(slider) ? slider : 0));
  return value <= SILENT_BELOW ? 0 : value * value;
}

export function isSilent(slider: number) {
  return sliderToGain(slider) === 0;
}
