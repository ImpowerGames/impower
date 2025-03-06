import { Create } from "../../../core/types/Create";
import { Character } from "../types/Character";
import { default_inflection } from "./default_inflection";
import { default_prosody } from "./default_prosody";

export const default_character: Create<Character> = (obj) => ({
  $type: "character",
  $name: "$default",
  $link: {
    synth: {},
    image: {},
    audio: {},
  },
  name: "",
  color: "",
  ...obj,
  inflection: default_inflection(obj?.inflection),
  prosody: default_prosody(obj?.prosody),
});
