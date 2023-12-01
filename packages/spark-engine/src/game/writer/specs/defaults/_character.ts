import { Create } from "../../../core/types/Create";
import { Character } from "../Character";
import { _inflection } from "./_inflection";
import { _prosody } from "./_prosody";

export const _character: Create<Character> = () => ({
  name: "",
  image: "",
  color: "",
  synth: {
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
