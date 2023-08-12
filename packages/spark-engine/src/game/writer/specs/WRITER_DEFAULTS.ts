import { _writer } from "./_writer";

export const WRITER_DEFAULTS = {
  "": _writer(),
  scene: _writer({
    className: "Scene",
  }),
  action: _writer({
    className: "Action",
  }),
  dialogue: _writer({
    className: "Dialogue",
  }),
};
