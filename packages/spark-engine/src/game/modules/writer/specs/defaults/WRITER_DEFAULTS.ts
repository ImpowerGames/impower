import { _writer } from "../_writer";

export const WRITER_DEFAULTS = {
  default: _writer({ $name: "default" }),
  transition: _writer({
    $name: "transition",
    letter_pause: 0.025,
  }),
  scene: _writer({
    $name: "scene",
    letter_pause: 0.025,
  }),
  action: _writer({
    $name: "action",
    letter_pause: 0.025,
  }),
  dialogue: _writer({
    $name: "dialogue",
    skipped: "(beat)",
    letter_pause: 0.025,
  }),
  character_name: _writer({ $name: "character_name" }),
  character_parenthetical: _writer({ $name: "character_parenthetical" }),
};
