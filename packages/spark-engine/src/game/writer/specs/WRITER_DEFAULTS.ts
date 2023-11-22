import { _writer } from "./_writer";

export const WRITER_DEFAULTS = {
  "": _writer(),
  SceneWriter: _writer({
    className: "Scene",
  }),
  ActionWriter: _writer({
    className: "Action",
  }),
  DialogueWriter: _writer({
    className: "Dialogue",
  }),
  CharacterNameWriter: _writer({
    className: "CharacterName",
    letterDelay: 0,
  }),
  CharacterParentheticalWriter: _writer({
    className: "CharacterParenthetical",
    letterDelay: 0,
  }),
  ParentheticalWriter: _writer({
    className: "Parenthetical",
    letterDelay: 0,
  }),
  ChoiceWriter: _writer({
    className: "Choice",
    letterDelay: 0,
  }),
};
