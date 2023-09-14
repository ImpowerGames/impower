import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";

export default spec({
  tag: "se-preview-mode-toolbar",
  context: WorkspaceContext.instance,
  css,
  html: ({ store }) => {
    const mode = store?.preview?.mode || "game";
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
