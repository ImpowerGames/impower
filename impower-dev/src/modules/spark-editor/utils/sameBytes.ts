export const sameBytes = (a: ArrayBuffer, b: ArrayBuffer): boolean => {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  return x.every((byte, index) => byte === y[index]);
};
