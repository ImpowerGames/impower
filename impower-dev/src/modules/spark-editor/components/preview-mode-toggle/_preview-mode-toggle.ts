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
        text-size="18"
        class="more"
        color="fg-50"
        variant="icon"
        icon="${mode === "game" ? "script #ffffff80" : "gamepad #ffffff80"}"
        active-icon="${mode === "game"
          ? "gamepad #ffffff80"
          : "script #ffffff80"}"
        value="${mode === "game" ? "screenplay" : "game"}"
      ></s-button>
    `;
  },
  css,
});
