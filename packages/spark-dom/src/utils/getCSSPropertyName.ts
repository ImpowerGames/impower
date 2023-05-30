export const getCSSPropertyName = (name: string, separator = "-"): string => {
  const cssProp = name
    .replace(/([a-z](?=[A-Z]))/g, `$1${separator}`)
    .replace(/([_])/g, separator)
    .toLowerCase();
  if (cssProp.startsWith("webkit-")) {
    return `-${cssProp}`;
  }
  if (cssProp === "hovered") {
    return "hover";
  }
  if (cssProp === "pressed") {
    return "active";
  }
  if (cssProp === "focused") {
    return "focus";
  }
  if (
    cssProp === "after" ||
    cssProp === "before" ||
    cssProp === "backdrop" ||
    cssProp === "cue" ||
    cssProp === "cue-region" ||
    cssProp === "first-letter" ||
    cssProp === "first-line" ||
    cssProp === "file-selector-button" ||
    cssProp === "marker" ||
    cssProp === "placeholder" ||
    cssProp === "selection"
  ) {
    return `:${cssProp}`;
  }
  return cssProp;
};
