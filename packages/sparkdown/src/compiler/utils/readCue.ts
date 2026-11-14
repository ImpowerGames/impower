export interface CuePart {
  text: string;
  from: number;
  to: number;
}

export interface CueReading {
  name: CuePart;
  as?: CuePart;
  speaker?: CuePart;
  parenthetical?: CuePart;
  position?: CuePart;
}

const WS = "[^\\S\\n\\r]";

const LUAU_NAME_END = "(?![a-zA-Z0-9_]|@[a-zA-Z0-9_])";

const LUAU_KEYWORD = `(?:and|break|do|else|elseif|end|false|for|function|if|in|local|nil|not|or|repeat|return|then|true|until|while)${LUAU_NAME_END}`;

const DEFINE_NAME = `(?!${LUAU_KEYWORD})[a-zA-Z_][a-zA-Z0-9_]*(?:@[a-zA-Z0-9_]+)*${LUAU_NAME_END}`;

const END_OF_CUE = `(?:$|${WS}*$|${WS}*[#]+(?=$|${WS}).*$)`;

const CUE = new RegExp(
  `^(${WS}*)(.*?)(?:(${WS}+)(as)(${WS}+)(${DEFINE_NAME}))?(${WS}*)(${WS}[(][^()\\r\\n]*?[)])?($|${WS}*)(${WS}\\[.*?\\])?(${END_OF_CUE})$`,
);

const PARENTHETICAL = new RegExp(`^(${WS})([(]${WS}*[^()\\r\\n]*?${WS}*[)])`);

const POSITION = new RegExp(`^(${WS}\\[${WS}*)(.*?)${WS}*\\]`);

const SPEAKER_BEING_WRITTEN = new RegExp(
  `^(.*[^\\s])${WS}+as${WS}+(?:[a-zA-Z_][a-zA-Z0-9_]*(?:@[a-zA-Z0-9_]*)*)?$`,
);

const part = (text: string, from: number): CuePart => ({ text, from, to: from + text.length });

export function shownNameBeforeSpeaker(cue: string): string | undefined {
  return SPEAKER_BEING_WRITTEN.exec(cue)?.[1];
}

export function readCue(cue: string): CueReading {
  const match = CUE.exec(cue);
  if (!match) return { name: part(cue, 0) };
  const groups = match.slice(1).map((group) => group ?? "");
  const starts: number[] = [];
  let at = 0;
  for (const group of groups) {
    starts.push(at);
    at += group.length;
  }
  const reading: CueReading = { name: part(groups[1]!, starts[1]!) };
  if (groups[5]) {
    reading.as = part(groups[3]!, starts[3]!);
    reading.speaker = part(groups[5], starts[5]!);
  }
  const parenthetical = PARENTHETICAL.exec(groups[7]!);
  if (parenthetical) {
    reading.parenthetical = part(parenthetical[2]!, starts[7]! + parenthetical[1]!.length);
  }
  const position = POSITION.exec(groups[9]!);
  if (position?.[2]) {
    reading.position = part(position[2], starts[9]! + position[1]!.length);
  }
  return reading;
}
