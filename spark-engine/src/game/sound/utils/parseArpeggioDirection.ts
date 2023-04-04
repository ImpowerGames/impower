export const parseArpeggioDirection = (
  token: string | undefined
): "up" | "down" | "up-down" | "down-up" | undefined => {
  const t = token?.trim()?.toLowerCase();
  if (t === "up" || t === "u" || t === "^") {
    return "up";
  } else if (t === "down" || t === "d" || t === "v") {
    return "down";
  } else if (t === "up-down" || t === "ud" || t === "^v") {
    return "up-down";
  } else if (t === "down-up" || t === "du" || t === "v^") {
    return "down-up";
  }
  return undefined;
};
