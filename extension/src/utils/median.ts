export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  values.sort(function (a, b) {
    return a - b;
  });
  const half = Math.floor(values.length / 2);
  if (values.length % 2) {
    return values[half];
  } else {
    return (values[half - 1] + values[half]) / 2.0;
  }
}
