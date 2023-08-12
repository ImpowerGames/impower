import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state: { store?: WorkspaceState }) => {
  const panel = state?.store?.panes?.preview?.panel || "game";
  return {
    html: html`
      <s-button
        type="toggle"
        width="48"
        height="48"
        text-size="18"
        class="more"
        color="fg-50"
        variant="icon"
        icon="${panel === "game" ? "gamepad" : "script"}"
        active-icon="${panel === "game" ? "script" : "gamepad"}"
        value="${panel === "game" ? "screenplay" : "game"}"
      ></s-button>
    `,
  };
};
