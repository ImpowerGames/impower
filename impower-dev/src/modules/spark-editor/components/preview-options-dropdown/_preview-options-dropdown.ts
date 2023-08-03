import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state: { store?: WorkspaceState }) => {
  const panel = state?.store?.panes?.preview?.panel || "game";
  return {
    html: html`
      <s-dropdown active="${panel}">
        <s-button
          width="48"
          height="48"
          class="more"
          color="fg-50"
          variant="icon"
          icon="dots-vertical"
        ></s-button>
        <slot slot="options">
          <s-option
            icon="gamepad"
            active-icon="check"
            value="game"
            ${panel === "game" ? "active" : ""}
            >Game</s-option
          >
          <s-option
            icon="script"
            active-icon="check"
            value="screenplay"
            ${panel === "screenplay" ? "active" : ""}
            >Screenplay</s-option
          >
        </slot>
      </s-dropdown>
    `,
  };
};
