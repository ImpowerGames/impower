import { _character } from "./constructors/_character";
import { _writer } from "./constructors/_writer";

export const writerBuiltins = () => ({
  writer: {
    default: _writer({
      $name: "default",
      prefix: " ",
    }),
    action: _writer({
      $name: "action",
      prefix: "",
      letter_pause: 0.025,
    }),
    transition: _writer({
      $name: "transition",
      prefix: "%",
      letter_pause: 0.025,
    }),
    scene: _writer({
      $name: "scene",
      prefix: "$",
      letter_pause: 0.025,
    }),
    dialogue: _writer({
      $name: "dialogue",
      prefix: "@",
      letter_pause: 0.025,
    }),
    character_name: _writer({
      $name: "character_name",
      prefix: " ",
    }),
    character_parenthetical: _writer({
      $name: "character_parenthetical",
      prefix: " ",
    }),
  },
  character: {
    default: _character({
      $name: "default",
    }),
  },
});

export type WriterBuiltins = ReturnType<typeof writerBuiltins>;
