import { OscillatorType } from "../types/OscillatorType";

export const parseOscillatorType = (
  token: string | undefined
): OscillatorType | undefined => {
  const t = token?.trim()?.toLowerCase();
  if (t === "sine" || t === "sin") {
    return "sine";
  } else if (t === "triangle" || t === "tri") {
    return "triangle";
  } else if (t === "sawtooth" || t === "saw") {
    return "sawtooth";
  } else if (t === "square" || t === "squ") {
    return "square";
  } else if (t === "tangent" || t === "tan") {
    return "tangent";
  } else if (t === "jitter" || t === "jit") {
    return "jitter";
  } else if (t === "brownnoise" || t === "brn") {
    return "brownnoise";
  } else if (t === "pinknoise" || t === "pin") {
    return "pinknoise";
  } else if (t === "whitenoise" || t === "whn") {
    return "whitenoise";
  }
  return undefined;
};
