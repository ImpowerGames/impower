import { OscillatorType } from "../types/OscillatorType";

export const stringifyOscillatorType = (
  token: OscillatorType
): string | undefined => {
  if (token === "sine") {
    return "sin";
  } else if (token === "triangle") {
    return "tri";
  } else if (token === "sawtooth") {
    return "saw";
  } else if (token === "square") {
    return "squ";
  } else if (token === "tangent") {
    return "tan";
  } else if (token === "jitter") {
    return "jit";
  } else if (token === "brownnoise") {
    return "brn";
  } else if (token === "pinknoise") {
    return "pin";
  } else if (token === "whitenoise") {
    return "whn";
  }
  return undefined;
};
