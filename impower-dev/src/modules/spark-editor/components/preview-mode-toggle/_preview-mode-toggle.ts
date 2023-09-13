import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";

export default spec({
  tag: "se-preview-mode-toolbar",
  cache: WorkspaceCache,
  css,
  reducer: (store?: WorkspaceStore) => ({
    mode: store?.preview?.mode || "game",
  }),
  html: ({ state }) => {
    const { mode } = state;
    return html`
      <s-button
        type="toggle"
        width="48"
        height="48"
        text-size="18"
        class="more"
        color="fg-50"
        variant="icon"
        icon="${mode === "game" ? "gamepad" : "script"}"
        active-icon="${mode === "game" ? "script" : "gamepad"}"
        value="${mode === "game" ? "screenplay" : "game"}"
      ></s-button>
    `;
  },
});
