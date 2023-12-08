import { Create } from "../../../core/types/Create";
import { _synth } from "../../../sound/specs/defaults/_synth";
import { Character } from "../Character";
import { _inflection } from "./_inflection";
import { _prosody } from "./_prosody";

export const _character: Create<Character> = (obj) => ({
  name: "",
  image: "",
  color: "",
  ...(obj || {}),
  inflection: _inflection(obj?.inflection),
  prosody: _prosody(obj?.prosody),
  synth: _synth({
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
    ...(obj?.synth || {}),
  }),
});
