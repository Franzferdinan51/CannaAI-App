// ============================================
// localStorage Helpers
// ============================================

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function loadTemperatureUnit(): 'C' | 'F' {
  return loadJSON<'C' | 'F'>('cannaai-temp-unit', 'F');
}

export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

export function fahrenheitToCelsius(f: number): number {
  return Math.round(((f - 32) * 5) / 9);
}

export function formatTemp(celsius: number, unit: 'C' | 'F'): string {
  return unit === 'F' ? `${celsiusToFahrenheit(celsius)}°F` : `${celsius}°C`;
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn(`localStorage quota exceeded for key "${key}". Attempting cleanup.`);
      // Try to free space by removing oldest analysis reports
      try {
        const REPORTS_KEY = 'cannaai_analysis_reports';
        if (key !== REPORTS_KEY) {
          const raw = localStorage.getItem(REPORTS_KEY);
          if (raw) {
            const reports = JSON.parse(raw);
            if (Array.isArray(reports) && reports.length > 5) {
              localStorage.setItem(REPORTS_KEY, JSON.stringify(reports.slice(0, 5)));
            }
          }
        }
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        console.error('Failed to save even after cleanup. Data may be too large.');
      }
    }
  }
}