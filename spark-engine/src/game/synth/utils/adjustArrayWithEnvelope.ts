import { EASE } from "../../core/constants/EASE";
import { EaseType } from "../../core/types/EaseType";
import { interpolate } from "../../core/utils/interpolate";

const value = (
  i: number,
  aI: number,
  hI: number,
  dI: number,
  sI: number,
  rI: number,
  hL: number,
  sL: number,
  aC: EaseType,
  dC: EaseType,
  rC: EaseType
): number => {
  if (i < aI) {
    const p = i / aI;
    return interpolate(p, 0, hL, EASE[aC]);
  }
  if (i >= aI && i < hI) {
    return hL;
  }
  if (i >= hI && i < dI) {
    const p = (i - hI) / (dI - hI);
    return interpolate(p, hL, sL, EASE[dC]);
  }
  if (i >= dI && i < sI) {
    return sL;
  }
  if (i >= sI && i < rI) {
    const p = (i - sI) / (rI - sI);
    return interpolate(p, sL, 0, EASE[rC]);
  }
  return 0;
};

export const adjustArrayWithEnvelope = (
  buffer: Float32Array,
  startIndex: number,
  endIndex: number,
  aLength: number,
  hLength: number,
  dLength: number,
  rLength: number,
  hVolume: number,
  sVolume: number,
  aEase: EaseType = "linear",
  dEase: EaseType = "linear",
  rEase: EaseType = "linear"
): void => {
  const totalLength = endIndex - startIndex;
  const aIndex = aLength;
  const hIndex = aIndex + hLength;
  const dIndex = hIndex + dLength;
  const sIndex = totalLength - rLength;
  const rIndex = totalLength;
  for (let i = startIndex; i < endIndex; i += 1) {
    const localIndex = i - startIndex;
    buffer[i] *= value(
      localIndex,
      aIndex,
      hIndex,
      dIndex,
      sIndex,
      rIndex,
      hVolume,
      sVolume,
      aEase,
      dEase,
      rEase
    );
  }
};
