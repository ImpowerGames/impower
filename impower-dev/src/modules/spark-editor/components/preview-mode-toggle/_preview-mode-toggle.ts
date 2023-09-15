import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-preview-mode-toolbar",
  stores: { workspace },
  html: ({ stores }) => {
    const mode = stores?.workspace?.current?.preview?.mode || "game";
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
  css,
});
