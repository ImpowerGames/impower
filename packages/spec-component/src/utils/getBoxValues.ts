import getUnitlessValue from "./getUnitlessValue";

const getBoxValues = (
  value: string | null
): {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
} => {
  if (value == null) {
    return {};
  }
  const parts = value?.split(/\s+/);
  if (parts.length === 2) {
    const block = getUnitlessValue(parts[0]!, 0);
    const inline = getUnitlessValue(parts[1]!, 0);
    return {
      top: block,
      bottom: block,
      left: inline,
      right: inline,
    };
  }
  if (parts.length === 4) {
    const top = getUnitlessValue(parts[0]!, 0);
    const right = getUnitlessValue(parts[1]!, 0);
    const bottom = getUnitlessValue(parts[2]!, 0);
    const left = getUnitlessValue(parts[3]!, 0);
    return {
      top,
      bottom,
      left,
      right,
    };
  }
  const v = getUnitlessValue(parts[0]!, 0);
  return {
    top: v,
    bottom: v,
    left: v,
    right: v,
  };
};

export default getBoxValues;
