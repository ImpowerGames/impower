import { Character } from "../types/Character";
import { DEFAULT_INTONATION } from "./DEFAULT_INTONATION";
import { DEFAULT_PROSODY } from "./DEFAULT_PROSODY";

export const DEFAULT_CHARACTER: Character = {
  intonation: DEFAULT_INTONATION,
  prosody: DEFAULT_PROSODY,
  name: "",
  image: "",
  color: "",
  voiceSound: {},
};
