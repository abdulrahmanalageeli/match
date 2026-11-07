// Shared by the worker and fallback, keeping the saved pixels deterministic.
export function blurPixels(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (!radius) return;
  const temp = new Uint8ClampedArray(data.length), span = radius * 2 + 1;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < height; y++) for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += data[(y * width + Math.max(0, Math.min(width - 1, k))) * 4 + c];
      for (let x = 0; x < width; x++) {
        temp[(y * width + x) * 4 + c] = sum / span;
        sum += data[(y * width + Math.min(width - 1, x + radius + 1)) * 4 + c] - data[(y * width + Math.max(0, x - radius)) * 4 + c];
      }
    }
    for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += temp[(Math.max(0, Math.min(height - 1, k)) * width + x) * 4 + c];
      for (let y = 0; y < height; y++) {
        data[(y * width + x) * 4 + c] = sum / span;
        sum += temp[(Math.min(height - 1, y + radius + 1) * width + x) * 4 + c] - temp[(Math.max(0, y - radius) * width + x) * 4 + c];
      }
    }
  }
}
