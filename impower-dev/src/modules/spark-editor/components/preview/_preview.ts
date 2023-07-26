import { html } from "../../core/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state?: { store?: WorkspaceState }) => {
  const mode = state?.store?.logic?.panel || "game";
  return {
    html: html`
      <s-router key="preview" active="${mode}">
        <s-box
          height="panel-nav"
          bg-color="panel"
          position="sticky-top"
          child-layout="row"
          slot="header"
        >
          <s-box
            bg-color="panel"
            position="absolute"
            i="0 0 0 0"
            height="100vh"
            translate-y="-100%"
          ></s-box>
          <s-box width-min="56"></s-box>
          <s-box p="16" text-size="lg" child-align="center" grow>
            <s-transition router="preview" exit="fade-out" enter="fade-in">
              <div class="mode-title">Game Preview</div>
            </s-transition>
          </s-box>
          <s-dropdown active="${mode}">
            <s-button
              m="8"
              class="more"
              color="inherit"
              opacity="0.5"
              variant="icon"
              icon="dots-vertical"
            ></s-button>
            <slot slot="options">
              <s-option
                icon="gamepad"
                active-icon="check"
                value="game"
                ${mode === "game" ? "active" : ""}
                >Game</s-option
              >
              <s-option
                icon="script"
                active-icon="check"
                value="screenplay"
                ${mode === "screenplay" ? "active" : ""}
                >Screenplay</s-option
              >
            </slot>
          </s-dropdown>
        </s-box>
        <template value="game">
          <se-game-preview file-path="logic/main.sd"></se-game-preview>
        </template>
        <template value="screenplay">
          <se-screenplay-preview
            file-path="logic/main.sd"
          ></se-screenplay-preview>
        </template>
      </s-router>
    `,
  };
};
