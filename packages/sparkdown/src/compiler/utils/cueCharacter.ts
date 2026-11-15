import { writtenText } from "../../runtime/displayStyle";
import { readCue } from "./readCue";

export type CharacterNames = Record<string, string>;

export const characterNames = (
  context: Record<string, any> | undefined,
): CharacterNames => {
  const names: CharacterNames = Object.create(null);
  const characters = Object.entries<any>(context?.["character"] ?? {});
  for (const [key, character] of characters) {
    const aliases = character?.aliases;
    if (!key.startsWith("$") && Array.isArray(aliases)) {
      for (const alias of aliases) {
        if (typeof alias === "string" && alias) {
          const owner = Object.hasOwn(names, alias) ? names[alias] : key;
          names[alias] = owner === key ? key : "";
        }
      }
    }
  }
  for (const [key, character] of characters) {
    const name = character?.name;
    if (typeof name === "string" && name) {
      names[name] = key;
    }
  }
  return names;
};

export const cueCharacter = (
  context: Record<string, any> | undefined,
  names: CharacterNames,
  cue: string,
): string | undefined => {
  const characters = context?.["character"];
  const own = (key: string) =>
    characters && Object.hasOwn(characters, key) && characters[key]
      ? key
      : undefined;
  const reading = readCue(cue);
  if (reading.speaker) {
    return own(reading.speaker.text);
  }
  const written = writtenText(reading.name.text);
  return own(written) ?? own(names[written] || "");
};
