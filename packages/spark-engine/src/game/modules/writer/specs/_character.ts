import { Create } from "../../../core/types/Create";
import { Character } from "../types/Character";
import { _inflection } from "./_inflection";
import { _prosody } from "./_prosody";

export const _character: Create<Character> = (obj) => ({
  name: "",
  color: "",
  ...(obj || {}),
  inflection: _inflection(obj?.inflection),
  prosody: _prosody(obj?.prosody),
});
