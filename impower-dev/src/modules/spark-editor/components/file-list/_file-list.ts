import { spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import css from "./file-list.css";
import html from "./file-list.html";

export default spec({
  tag: "se-file-list",
  context: WorkspaceContext.instance,
  css: [...sharedCSS, css],
  props: {
    include: "",
    exclude: "",
    accept: "",
  },
  html,
});
