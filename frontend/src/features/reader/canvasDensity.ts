/** iOS Safari refuses (draws nothing on) a canvas above this many pixels. */
export const MAX_CANVAS_PIXELS = 16_777_216

/**
 * How many canvas pixels to draw per CSS pixel. Normally the screen's density (`dpr`, so text is sharp on a 3x phone);
 * when that would make the canvas bigger than `maxPixels` (a page zoomed in a lot), the density is lowered just enough
 * that the canvas fits: slightly softer text instead of a blank page or a crashed tab.
 */
export function canvasDensity(dpr: number, cssWidth: number, cssHeight: number, maxPixels = MAX_CANVAS_PIXELS): number {
  const area = cssWidth * cssHeight
  return area * dpr * dpr <= maxPixels ? dpr : Math.sqrt(maxPixels / area)
}
