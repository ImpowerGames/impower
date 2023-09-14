import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";
import html from "./script-editor.html";

export default spec({
  tag: "se-script-editor",
  context: WorkspaceContext.instance,
  css,
  props: {
    filename: "",
  },
  state: (store?: WorkspaceStore) => ({
    pulledAt: store?.project?.pulledAt || "",
  }),
  html,
});
