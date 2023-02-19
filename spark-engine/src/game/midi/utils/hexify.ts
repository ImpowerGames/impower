export const hexifyNumber = (number: number): string => {
  return number.toString(16).toUpperCase().padStart(2, "0");
};

/**
 * This function turns a part of a given ArrayBuffer into a hexadecimal String.
 */
export const hexify = (
  dataView: DataView,
  offset = 0,
  length = dataView.byteLength - (offset - dataView.byteOffset)
) => {
  const byteOffset = offset + dataView.byteOffset;

  const hexArray = [];

  const uint8Array = new Uint8Array(dataView.buffer, byteOffset, length);

  for (let i = 0; i < length; i += 1) {
    hexArray[i] = hexifyNumber(uint8Array[i] ?? 0);
  }

  return hexArray.join("");
};
