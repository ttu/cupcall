export const MIN_ZOOM_PERCENT = 50;
export const MAX_ZOOM_PERCENT = 150;
export const ZOOM_STEP_PERCENT = 10;

function clampPercent(percent: number): number {
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, percent));
}

export function computeAutoFitScale(containerWidth: number, contentWidth: number): number {
  if (contentWidth <= 0) return MAX_ZOOM_PERCENT / 100;
  if (containerWidth <= 0) return MIN_ZOOM_PERCENT / 100;

  const idealPercent = (containerWidth / contentWidth) * 100;
  return clampPercent(idealPercent) / 100;
}

export function stepZoomPercent(currentPercent: number, direction: 'in' | 'out'): number {
  const snapped = Math.round(currentPercent / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT;
  const next = direction === 'in' ? snapped + ZOOM_STEP_PERCENT : snapped - ZOOM_STEP_PERCENT;
  return clampPercent(next);
}

export function canZoomOut(currentPercent: number): boolean {
  return currentPercent > MIN_ZOOM_PERCENT;
}

export function canZoomIn(currentPercent: number): boolean {
  return currentPercent < MAX_ZOOM_PERCENT;
}
