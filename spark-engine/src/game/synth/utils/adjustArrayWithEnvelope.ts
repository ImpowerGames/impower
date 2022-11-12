const value = (
  p: number,
  a: number,
  d: number,
  s: number,
  r: number,
  sL: number
): number => {
  let v = 0;
  if (p <= a) {
    v = 0 + (1 - 0) * ((p - 0) / (a - 0));
  } else if (p > a && p <= d) {
    v = 1 + (sL - 1) * ((p - a) / (d - a));
  } else if (p > d && p <= s) {
    v = sL;
  } else if (p > s && p <= r) {
    v = sL + (0 - sL) * ((p - s) / (r - s));
  }
  return v;
};

export const adjustArrayWithEnvelope = (
  buffer: Float32Array,
  a: number,
  d: number,
  s: number,
  r: number,
  sL: number
) => {
  let p = 0;
  for (var i = 0; i < buffer.length; i++) {
    buffer[i] *= value(p, a, d, s, r, sL);
    p++;
  }
  return buffer;
};
