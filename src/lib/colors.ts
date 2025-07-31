export function getHeatmapColor(value: number | null, min: number, max: number): string {
  if (value === null || isNaN(value)) return 'hsl(var(--card))';
  const range = max - min;
  if (range <= 0) return 'rgba(128, 128, 255, 0.7)'; // Default color for single value

  const ratio = Math.max(0, Math.min(1, (value - min) / range));

  // HSL color interpolation: Blue (240) -> Green (120) -> Red (0)
  const hue = (1 - ratio) * 240;

  return `hsla(${hue}, 100%, 50%, 0.7)`;
}

export function getTextColorForBackground(bgColor: string): string {
    if (!bgColor.startsWith('hsla')) {
        return 'hsl(var(--foreground))';
    }

    try {
        const parts = bgColor.match(/hsla\((\d+),\s*(\d+)%,\s*(\d+)%/);
        if (!parts) return 'hsl(var(--foreground))';

        const h = parseInt(parts[1], 10);
        const s = parseInt(parts[2], 10) / 100;
        const l = parseInt(parts[3], 10) / 100;

        // Formula to calculate perceived brightness (luminance)
        const luminance = l; // For HSL, lightness is a good proxy

        // Use white text on dark backgrounds and black text on light backgrounds
        return luminance < 0.5 ? 'white' : 'black';

    } catch {
        return 'hsl(var(--foreground))';
    }
}
