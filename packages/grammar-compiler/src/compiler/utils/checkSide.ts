import { Side } from "../enums/Side";

export const checkSide = (
  side: Side,
  pos: number,
  from: number,
  to: number
) => {
  switch (side) {
    case Side.Before:
      return from < pos;
    case Side.AtOrBefore:
      return to >= pos && from < pos;
    case Side.Around:
      return from < pos && to > pos;
    case Side.AtOrAfter:
      return from <= pos && to > pos;
    case Side.After:
      return to > pos;
    case Side.DontCare:
      return true;
  }
};
