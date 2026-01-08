import { Create } from "../../../core/types/Create";
import { Character } from "../types/Character";

export const default_character: Create<Character> = (obj) => ({
  $type: "character",
  $name: "$default",
  $link: {
    image: {},
    audio: {},
    synth: {},
    typewriter: {},
    inflection: {},
    prosody: {},
  },
  name: "",
  color: "",
  ...obj,
});
