export const sum = (vectors: number[][]): number[] => {
  const sum: number[] = [];
  vectors.forEach((v) => {
    if (v) {
      v.forEach((p, i) => {
        sum[i] = (sum[i] || 0) + p;
      });
    }
  });
  return sum;
};

export const difference = (v1: number[], v2: number[]): number[] => {
  const difference: number[] = [];
  for (let i = 0; i < v1.length; i++) {
    difference[i] = (v1[i] || 0) - (v2[i] || 0);
  }
  return difference;
};

export const average = (vectors: number[][]): number[] => {
  const validVectors = vectors.filter((v) => Boolean(v));
  const count = validVectors.length;
  const avg: number[] = [];
  sum(validVectors).forEach((p, i) => {
    avg[i] = p / count;
  });
  return avg;
};

export const similarity = (v1: number[], v2: number[]): number => {
  if (!v1 || !v2) {
    return 0;
  }
  return Math.abs(
    v1.reduce((sum, a, idx) => {
      return sum + a * v2[idx];
    }, 0) /
      (mag(v1) * mag(v2))
  );
};

export const mag = (a: number[]): number => {
  return Math.sqrt(
    a.reduce((sum, val) => {
      return sum + val * val;
    }, 0)
  );
};

export const round = (x: number) =>
  Math.round((x + Number.EPSILON) * 100) / 100;
