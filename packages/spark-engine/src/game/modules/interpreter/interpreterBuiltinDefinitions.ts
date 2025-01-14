import { default_character } from "./constructors/default_character";
import { default_typewriter } from "./constructors/default_typewriter";

export const interpreterBuiltinDefinitions = () => ({
  config: {
    interpreter: {
      directives: {
        scene: "$",
        transition: "%",
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
    action: default_typewriter({
      $name: "action",
      letter_pause: 0.025,
    }),
    transition: default_typewriter({
      $name: "transition",
      letter_pause: 0.025,
    }),
    scene: default_typewriter({
      $name: "scene",
      letter_pause: 0.025,
    }),
    dialogue: default_typewriter({
      $name: "dialogue",
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

export type InterpreterBuiltins = ReturnType<
  typeof interpreterBuiltinDefinitions
>;
