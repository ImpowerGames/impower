/**
 * Convert from BeatSaver Beatmap Schema to Spark Beatmap Schema
 * https://bsmg.wiki/mapping/map-format.html#base-object-2
 */

import { Beat } from "../types/Beat";
import { BSNote } from "../types/BSNote";
import { InputSymbol } from "../types/InputSymbol";

const getDirection = (v: number | string): InputSymbol | undefined => {
  if (typeof v === "string") {
    return v as InputSymbol;
  }
  switch (v) {
    case 0:
      return "^";
    case 1:
      return "v";
    case 2:
      return ">";
    case 3:
      return "<";
    case 4:
      return "\\";
    case 5:
      return "/";
    case 6:
      return "/";
    case 7:
      return "\\";
    default:
      return "*";
  }
};

export const convertBSData = (dat: string | object): Beat[] => {
  const data = typeof dat === "string" ? JSON.parse(dat) : dat;
  const notes: BSNote[] = Array.isArray(data)
    ? data
    : data.colorNotes || data._notes;
  const beats: Beat[] = [];
  notes.forEach((note) => {
    beats.push({
      n: note.n ?? note.b ?? note._time ?? -1,
      x: note.x ?? note._lineIndex ?? -1,
      y: note.y ?? note._lineLayer ?? -1,
      d: getDirection(note.d ?? note._cutDirection ?? -1),
    });
  });
  return beats;
};
