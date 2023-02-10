/**
 * Convert from BeatSaver Beatmap Schema to Spark Beatmap Schema
 * https://bsmg.wiki/mapping/map-format.html#base-object-2
 */

import { Beat } from "../types/Beat";
import { BSNote } from "../types/BSNote";
import { SwipeSymbol } from "../types/SwipeSymbol";

const getDirection = (v: number | string): SwipeSymbol | undefined => {
  if (typeof v === "string") {
    return v as SwipeSymbol;
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
  if (Array.isArray(notes)) {
    notes.forEach((note) => {
      beats.push({
        z: note.z ?? note.b ?? note._time ?? -1,
        x: note.x ?? note._lineIndex ?? -1,
        y: note.y ?? note._lineLayer ?? -1,
        s: getDirection(note.s ?? note.d ?? note._cutDirection ?? -1),
      });
    });
  }
  return beats;
};
