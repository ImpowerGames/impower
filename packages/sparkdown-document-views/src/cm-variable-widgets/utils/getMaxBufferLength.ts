export const getMaxBufferLength = (
  ...buffers: (Float32Array | undefined)[]
): number => {
  return Math.max(...buffers.map((b) => b?.length || 0));
};
