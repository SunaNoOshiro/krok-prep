export function normalizeDisplayText(value: string): string {
  return value
    .replace(/(\d+(?:[.,]\d+)?)\s*\^[оoОO]/g, '$1°')
    .replace(/\bSpO_?2\b/g, 'SpO2')
    .replace(/\bTh-?(\d+)\b/gi, 'Т$1');
}
