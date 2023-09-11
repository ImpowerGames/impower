import getUnitlessValue from "../../../spec-component/src/utils/getUnitlessValue";

export const getPixelValue = (
  element: HTMLElement,
  variableName: string
): number => {
  const computedStyle = getComputedStyle(element);
  const prop = variableName.startsWith("--")
    ? variableName
    : `--${variableName}`;
  const computedValue = computedStyle.getPropertyValue(prop);
  return getUnitlessValue(computedValue, 0);
};
