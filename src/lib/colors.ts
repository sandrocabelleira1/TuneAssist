export function getHeatmapColor(value: number | null, min: number, max: number): string {
  if (value === null || isNaN(value)) return 'hsl(var(--card))'; // Use card background for null/NaN
  const range = max - min;
  if (range === 0) return 'rgba(74, 222, 128, 0.8)';
  
  const ratio = Math.max(0, Math.min(1, (value - min) / range));
  
  // Blue -> Green -> Yellow -> Red gradient
  const h = (1 - ratio) * 240; // 240 (blue) -> 0 (red)
  const s = 1;
  const l = 0.5;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c/2;
  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return `rgba(${r}, ${g}, ${b}, 0.7)`;
}

export function getCorrectionColor(value: number | null): string {
  if (value === null || isNaN(value) || Math.abs(value) < 0.01) return 'hsl(var(--card))';
  
  const intensity = Math.min(1, Math.abs(value) / 15); // Cap intensity at 15% change
  
  // Red for negative, Green for positive
  if (value > 0) {
    // Green
    return `rgba(74, 222, 128, ${intensity})`;
  } else {
    // Red
    return `rgba(239, 68, 68, ${intensity})`;
  }
}
