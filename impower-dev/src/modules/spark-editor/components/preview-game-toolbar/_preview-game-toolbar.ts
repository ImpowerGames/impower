import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-preview-game-toolbar",
  stores: { workspace },
  context: ({ workspace }) => ({
    running: workspace?.current?.preview?.modes?.game?.running || false,
    paused: workspace?.current?.preview?.modes?.game?.paused || false,
    debugging: workspace?.current?.preview?.modes?.game?.debugging || false,
  }),
  html: ({ context }) => {
    const { running, paused, debugging } = context;
    const titleEl = () =>
      html`<s-box child-justify="center" text-align="center" grow inert
        >Game Preview</s-box
      >`;
    const modeButton = () => html`
      <se-preview-mode-toggle></se-preview-mode-toggle>
    `;
    const settingsDropdown = () => html`
      <s-dropdown id="settingsDropdown">
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
        id="stepBackwardButton"
        width="48"
        height="48"
        color="fg"
        variant="icon"
        icon="player-skip-back-fill"
      ></s-button>
      <s-button
        id="fastBackwardButton"
        width="48"
        height="48"
        color="fg"
        variant="icon"
        icon="player-track-prev-fill"
      ></s-button>
      <s-button
        id="pauseToggleButton"
        width="48"
        height="48"
        color="fg"
        variant="icon"
        text-size="20"
        icon="${paused ? `player-play-fill` : `player-pause-fill`}"
      ></s-button>
      <s-button
        id="fastForwardButton"
        width="48"
        height="48"
        color="fg"
        variant="icon"
        icon="player-track-next-fill"
      ></s-button>
      <s-button
        id="stepForwardButton"
        width="48"
        height="48"
        color="fg"
        variant="icon"
        icon="player-skip-forward-fill"
      ></s-button>
    `;
    return html`
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
              id="runToggleButton"
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
    `;
  },
  selectors: {
    runToggleButton: "",
    settingsDropdown: null,
    stepBackwardButton: null,
    fastBackwardButton: null,
    pauseToggleButton: null,
    fastForwardButton: null,
    stepForwardButton: null,
  } as const,
  css,
});
