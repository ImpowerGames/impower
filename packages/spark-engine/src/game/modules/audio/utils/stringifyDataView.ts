export const stringifyDataView = (
  dataView: DataView,
  offset = 0,
  length = dataView.byteLength - (offset - dataView.byteOffset),
) => {
  const byteOffset = offset + dataView.byteOffset;

  const array = new Uint8Array(dataView.buffer, byteOffset, length);

  return String.fromCharCode.apply(null, <number[]>(<any>array));
};
