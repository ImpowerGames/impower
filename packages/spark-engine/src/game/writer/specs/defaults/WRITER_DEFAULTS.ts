import { _writer } from "./_writer";

export const WRITER_DEFAULTS = {
  "": _writer(),
  transition_writer: _writer({}),
  scene_writer: _writer({}),
  action_writer: _writer({}),
  dialogue_writer: _writer({
    skipped: "(beat)",
  }),
  character_name_writer: _writer({
    letter_pause: 0,
  }),
  character_parenthetical_writer: _writer({
    letter_pause: 0,
  }),
};
