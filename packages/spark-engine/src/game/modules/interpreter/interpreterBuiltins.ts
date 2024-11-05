import { default_character } from "./constructors/default_character";
import { default_writer } from "./constructors/default_writer";
import { schema_character } from "./constructors/schema_character";
import { schema_writer } from "./constructors/schema_writer";

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
  writer: {
    $default: default_writer(),
    action: default_writer({
      $name: "action",
      letter_pause: 0.025,
    }),
    transition: default_writer({
      $name: "transition",
      letter_pause: 0.025,
    }),
    scene: default_writer({
      $name: "scene",
      letter_pause: 0.025,
    }),
    dialogue: default_writer({
      $name: "dialogue",
      letter_pause: 0.025,
    }),
    character_name: default_writer({
      $name: "character_name",
    }),
    character_parenthetical: default_writer({
      $name: "character_parenthetical",
    }),
    portrait: default_writer({
      $name: "portrait",
    }),
  } as Record<string, ReturnType<typeof default_writer>>,
  character: {
    $default: default_character(),
  } as Record<string, ReturnType<typeof default_character>>,
});

export const interpreterSchemaDefinitions = () => ({
  writer: {
    $schema: schema_writer(),
  } as Record<string, ReturnType<typeof schema_writer>>,
  character: {
    $schema: schema_character(),
  } as Record<string, ReturnType<typeof schema_character>>,
});

export type InterpreterBuiltins = ReturnType<
  typeof interpreterBuiltinDefinitions
>;
