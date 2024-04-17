import { spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import html from "./account.html";

export default spec({
  tag: "se-account",
  stores: { workspace },
  html,
  selectors: {
    local: "",
    authenticated: "",
    unauthenticated: "",
    accountName: "",
    accountEmail: "",
    signinButton: "",
    signoutButton: "",
    uploadButton: "",
    loadProjectButton: "",
    saveProjectButton: "",
    importProjectButton: "",
    exportProjectButton: "",
  } as const,
  css,
});
