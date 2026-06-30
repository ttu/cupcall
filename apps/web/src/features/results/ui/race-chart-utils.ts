function rangeStep(range: number): number {
  return range <= 10 ? 5 : range <= 100 ? 10 : range <= 200 ? 20 : range <= 500 ? 50 : 100;
}

export function computeYBounds(values: number[]): { yMin: number; yMax: number; yStep: number } {
  if (values.length === 0) return { yMin: 0, yMax: 10, yStep: 5 };
  const rawMax = Math.max(...values, 0);
  const rawMin = Math.min(...values);
  const bufferedMax = rawMax * 1.1;
  const yStep = rangeStep(bufferedMax - rawMin);
  const yMax = Math.max(Math.ceil(bufferedMax / yStep) * yStep, yStep);
  const yMin = Math.floor(rawMin / yStep) * yStep;
  return { yMin, yMax, yStep };
}

export function buildGridLines(yMin: number, yMax: number): number[] {
  const step = rangeStep(yMax - yMin);
  const lines: number[] = [];
  const start = Math.ceil(yMin / step) * step;
  for (let v = start; v <= yMax; v += step) lines.push(v);
  return lines;
}
