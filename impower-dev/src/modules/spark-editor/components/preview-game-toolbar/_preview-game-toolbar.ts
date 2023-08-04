import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state: { store?: WorkspaceState }) => {
  const running = state?.store?.panes?.preview?.panels?.game?.running;
  const paused = state?.store?.panes?.preview?.panels?.game?.paused;
  const titleEl = () =>
    html`<s-box text-align="center" grow>Game Preview</s-box>`;
  const optionsButton = () => html`
    <se-preview-options-dropdown></se-preview-options-dropdown>
  `;
  const fullscreenButton = () => html`
    <s-button
      id="fullscreen-button"
      width="48"
      height="48"
      color="fg-50"
      variant="icon"
      icon="maximize"
    ></s-button>
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
          <s-box child-layout="row" child-align="center" grow>
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
            <s-box child-layout="row" child-justify="center" grow>
              ${running ? playbackControls : titleEl}
            </s-box>
          </s-box>
        </s-box>
        ${running ? fullscreenButton : optionsButton}
      </s-box>
    `,
  };
};
