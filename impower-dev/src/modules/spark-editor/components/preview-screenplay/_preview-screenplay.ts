import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./preview-screenplay.html";

export default spec({
  tag: "se-preview-screenplay",
  context: WorkspaceContext.instance,
  css,
  state: (store?: WorkspaceStore) => ({
    pulledAt: store?.project?.pulledAt || "",
  }),
  html,
});
