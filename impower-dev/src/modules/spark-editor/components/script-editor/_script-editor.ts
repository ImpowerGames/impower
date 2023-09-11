import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./script-editor.html";

export default spec({
  tag: "se-script-editor",
  css,
  props: {
    filename: "",
  },
  cache: WorkspaceCache.get,
  reducer: (store?: WorkspaceStore) => ({
    syncedAt: store?.project?.syncedAt || "",
  }),
  html,
});
