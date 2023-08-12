import { Create } from "../../core/types/Create";
import { Character } from "../types/Character";
import { _inflection } from "./_inflection";
import { _prosody } from "./_prosody";

export const _character: Create<Character> = () => ({
  name: "",
  image: "",
  color: "",
  voiceSound: {
    shape: "triangle",
    envelope: {
      attack: 0.007,
      decay: 0.003,
      sustain: 0.04,
      release: 0.01,
    },
    pitch: {
      frequency: 440,
    },
  },
  inflection: _inflection(),
  prosody: _prosody(),
});
