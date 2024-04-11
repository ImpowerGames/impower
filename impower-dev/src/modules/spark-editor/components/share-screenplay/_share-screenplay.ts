import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./share-screenplay.html";

export default spec({
  tag: "se-share-screenplay",
  stores: { workspace },
  html,
  css,
  selectors: {
    htmlButton: "",
    pdfButton: "",
    htmlProgressBar: "",
    pdfProgressBar: "",
  },
});
