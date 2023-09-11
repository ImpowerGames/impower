const getPropValue = (attrValue: string | null, defaultPropValue: unknown) => {
  if (attrValue === undefined) {
    return defaultPropValue;
  } else if (attrValue === null) {
    return defaultPropValue;
  } else if (typeof defaultPropValue === "boolean") {
    return attrValue != null;
  } else if (typeof defaultPropValue === "number") {
    return Number(attrValue);
  } else {
    return attrValue;
  }
};

export default getPropValue;
