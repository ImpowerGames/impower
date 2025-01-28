import { spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import css from "./scrollable.css";
import html from "./scrollable.html";

export default spec({
  tag: "se-scrollable",
  stores: { workspace },
  props: {
    include: "",
    exclude: "",
  },
  html,
  selectors: {
    empty: "",
    list: "",
    outlet: "",
  } as const,
  css: [...sharedCSS, css],
});
