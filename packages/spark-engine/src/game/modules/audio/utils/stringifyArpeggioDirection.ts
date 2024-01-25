export const stringifyArpeggioDirection = (
  token: "up" | "down" | "up-down" | "down-up"
): string | undefined => {
  if (token === "up") {
    return "u";
  } else if (token === "down") {
    return "d";
  } else if (token === "up-down") {
    return "ud";
  } else if (token === "down-up") {
    return "du";
  }
  return undefined;
};
