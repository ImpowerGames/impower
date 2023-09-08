import { WorkspaceState } from "@impower/spark-editor-protocol/src/types";
import { html } from "../../../../../../packages/spark-element/src/utils/html";

export default (state: { store?: WorkspaceState }) => {
  const running = state?.store?.panes?.preview?.panels?.game?.running;
  const paused = state?.store?.panes?.preview?.panels?.game?.paused;
  const debugging = state?.store?.panes?.preview?.panels?.game?.debugging;
  const titleEl = () =>
    html`<s-box child-justify="center" text-align="center" grow inert
      >Game Preview</s-box
    >`;
  const modeButton = () => html`
    <se-preview-mode-toggle></se-preview-mode-toggle>
  `;
  const settingsDropdown = () => html`
    <s-dropdown id="settings-dropdown">
      <s-button
        width="48"
        height="48"
        color="fg-50"
        variant="icon"
        icon="dots-vertical"
      ></s-button>
      <slot slot="options">
        <s-option
          key="debug"
          type="toggle"
          icon="bug-off"
          active-icon="check"
          ${debugging ? "active" : ""}
          >Debugging</s-option
        >
      </slot>
    </s-dropdown>
  `;
  const playbackControls = () => html`
    <s-button
      id="step-backward-button"
      width="48"
      height="48"
      color="fg"
      variant="icon"
      icon="player-skip-back-fill"
    ></s-button>
    <s-button
      id="fast-backward-button"
      width="48"
      height="48"
      color="fg"
      variant="icon"
      icon="player-track-prev-fill"
    ></s-button>
    <s-button
      id="pause-toggle-button"
      width="48"
      height="48"
      color="fg"
      variant="icon"
      text-size="20"
      icon="${paused ? `player-play-fill` : `player-pause-fill`}"
    ></s-button>
    <s-button
      id="fast-forward-button"
      width="48"
      height="48"
      color="fg"
      variant="icon"
      icon="player-track-next-fill"
    ></s-button>
    <s-button
      id="step-forward-button"
      width="48"
      height="48"
      color="fg"
      variant="icon"
      icon="player-skip-forward-fill"
    ></s-button>
  `;
  return {
    html: html`
      <s-box
        height="panel-nav"
        child-layout="row"
        child-align="center"
        bg-color="panel"
        z="1"
        grow
      >
        <s-box
          text-size="lg"
          child-layout="row"
          child-justify="center"
          child-align="center"
          grow
        >
          <s-list child-layout="row" child-justify="center" grow>
            <s-button
              id="run-toggle-button"
              variant="text"
              width="48"
              height="44"
              text-size="2xs"
              child-layout="column"
              color="primary-70"
            >
              <s-icon
                icon="${running ? `player-stop` : `player-play`}"
                size="20"
                m-b="1"
              ></s-icon>
              ${running ? `STOP` : `PLAY`}
            </s-button>
            <s-box grow inert></s-box>
            ${running ? playbackControls : titleEl}
            <s-box grow inert></s-box>
            ${running ? settingsDropdown : modeButton}
          </s-list>
        </s-box>
      </s-box>
    `,
  };
};
