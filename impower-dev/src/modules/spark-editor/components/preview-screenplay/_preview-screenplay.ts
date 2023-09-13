import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import html from "./preview-screenplay.html";

export default spec({
  tag: "se-preview-screenplay",
  cache: WorkspaceCache,
  css,
  reducer: (store?: WorkspaceStore) => ({
    syncedAt: store?.project?.syncedAt || "",
  }),
  html,
});
