import { _character } from "./constructors/_character";
import { _writer } from "./constructors/_writer";

export const interpreterBuiltins = () => ({
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
    $default: _writer({
      $name: "$default",
    }),
    action: _writer({
      $name: "action",
      letter_pause: 0.025,
    }),
    transition: _writer({
      $name: "transition",
      letter_pause: 0.025,
    }),
    scene: _writer({
      $name: "scene",
      letter_pause: 0.025,
    }),
    dialogue: _writer({
      $name: "dialogue",
      letter_pause: 0.025,
    }),
    character_name: _writer({
      $name: "character_name",
    }),
    character_parenthetical: _writer({
      $name: "character_parenthetical",
    }),
    portrait: _writer({
      $name: "portrait",
    }),
  },
  character: {
    $default: _character({
      $name: "$default",
    }),
  },
});

export type InterpreterBuiltins = ReturnType<typeof interpreterBuiltins>;
