import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state?: { store?: WorkspaceState }) => {
  const mode = state?.store?.preview?.panel || "game";
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
          <s-box text-size="lg" child-layout="row" child-align="center" grow>
            <s-transition router="preview" exit="fade-out" enter="fade-in">
              <s-box
                id="game-toolbar"
                child-layout="row"
                child-align="center"
                ${mode !== "game" ? "hidden" : ""}
              >
                <s-button
                  variant="text"
                  width="56"
                  height="44"
                  text-size="2xs"
                  child-layout="column"
                  color="primary-70"
                >
                  <s-icon icon="player-play" size="20" m-b="1"></s-icon>
                  PLAY
                </s-button>
                <s-box p="16" text-align="center" grow>Game Preview</s-box>
              </s-box>
              <s-box
                id="screenplay-toolbar"
                child-layout="row"
                child-align="center"
                ${mode !== "screenplay" ? "hidden" : ""}
              >
                <s-box width="56"></s-box>
                <s-box p="16" text-align="center" grow
                  >Screenplay Preview</s-box
                >
              </s-box>
            </s-transition>
          </s-box>
          <s-dropdown active="${mode}">
            <s-button
              m="8"
              class="more"
              color="content"
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
