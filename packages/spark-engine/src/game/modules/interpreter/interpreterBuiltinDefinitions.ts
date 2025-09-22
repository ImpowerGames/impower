import { default_character } from "./constructors/default_character";
import { default_typewriter } from "./constructors/default_typewriter";

export const interpreterBuiltinDefinitions = () => ({
  config: {
    interpreter: {
      directives: {
        title: "^",
        heading: "$",
        transitional: "%",
        dialogue: "@",
        action: "!",
        write: ">",
      },
      fallbacks: {
        layer: "portrait",
        channel: "sound",
      },
    },
  },
  typewriter: {
    $default: default_typewriter(),
    title: default_typewriter({
      $name: "title",
      letter_pause: 0,
    }),
    heading: default_typewriter({
      $name: "heading",
      letter_pause: 0.025,
    }),
    transitional: default_typewriter({
      $name: "transitional",
      letter_pause: 0.025,
    }),
    dialogue: default_typewriter({
      $name: "dialogue",
      letter_pause: 0.025,
    }),
    action: default_typewriter({
      $name: "action",
      letter_pause: 0.025,
    }),
    character_name: default_typewriter({
      $name: "character_name",
    }),
    character_parenthetical: default_typewriter({
      $name: "character_parenthetical",
    }),
    portrait: default_typewriter({
      $name: "portrait",
    }),
  } as Record<string, ReturnType<typeof default_typewriter>>,
  character: {
    $default: default_character(),
  } as Record<string, ReturnType<typeof default_character>>,
});

export interface InterpreterBuiltins
  extends ReturnType<typeof interpreterBuiltinDefinitions> {}
