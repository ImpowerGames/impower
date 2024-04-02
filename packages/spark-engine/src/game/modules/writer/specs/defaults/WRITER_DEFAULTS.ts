import { _writer } from "./_writer";

export const WRITER_DEFAULTS = {
  default: _writer(),
  transition: _writer({
    letter_pause: 0.025,
  }),
  scene: _writer({
    letter_pause: 0.025,
  }),
  action: _writer({
    letter_pause: 0.025,
  }),
  dialogue: _writer({
    skipped: "(beat)",
    letter_pause: 0.025,
  }),
  character_name: _writer(),
  character_parenthetical: _writer(),
  backdrop: _writer({
    preserve_image: true,
  }),
};
