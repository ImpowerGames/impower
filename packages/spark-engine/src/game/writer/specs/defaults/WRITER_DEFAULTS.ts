import { _writer } from "./_writer";

export const WRITER_DEFAULTS = {
  "": _writer(),
  scene_writer: _writer({
    target: "scene",
  }),
  action_writer: _writer({
    target: "action",
  }),
  dialogue_writer: _writer({
    target: "dialogue",
  }),
  character_name_writer: _writer({
    target: "character_name",
    letter_delay: 0,
  }),
  character_parenthetical_writer: _writer({
    target: "character_parenthetical",
    letter_delay: 0,
  }),
  parenthetical_writer: _writer({
    target: "parenthetical",
    letter_delay: 0,
  }),
  choice_writer: _writer({
    target: "choice",
    letter_delay: 0,
  }),
};
