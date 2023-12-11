import { _writer } from "./_writer";

export const WRITER_DEFAULTS = {
  default: _writer(),
  transition: _writer({}),
  scene: _writer({}),
  action: _writer({}),
  dialogue: _writer({
    skipped: "(beat)",
  }),
  character_name: _writer({
    letter_pause: 0,
  }),
  character_parenthetical: _writer({
    letter_pause: 0,
  }),
};
