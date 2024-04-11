import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-preview-mode-toggle",
  stores: { workspace },
  html: ({ stores }) => {
    const mode = stores?.workspace?.current?.preview?.mode || "game";
    return html`
      <s-button
        type="toggle"
        width="48"
        height="48"
        class="more"
        color="fg-50"
        variant="icon"
        icon="${mode === "game" ? "license" : "gamepad"}"
        active-icon="${mode === "game" ? "gamepad" : "license"}"
        value="${mode === "game" ? "screenplay" : "game"}"
      ></s-button>
    `;
  },
  css,
});
