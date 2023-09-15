import { spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import css from "./file-list.css";
import html from "./file-list.html";

export default spec({
  tag: "se-file-list",
  stores: { workspace },
  props: {
    include: "",
    exclude: "",
    accept: "",
  },
  html,
  selectors: {
    empty: "",
    dragover: "",
    outlet: "",
  } as const,
  css: [...sharedCSS, css],
});
