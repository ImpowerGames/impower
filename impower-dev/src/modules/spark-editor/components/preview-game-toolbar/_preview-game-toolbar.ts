import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-preview-game-toolbar",
  stores: { workspace },
  reducer: ({ stores }) =>
    ({
      running:
        stores?.workspace?.current?.preview?.modes?.game?.running || false,
      paused: stores?.workspace?.current?.preview?.modes?.game?.paused || false,
      debugging:
        stores?.workspace?.current?.preview?.modes?.game?.debugging || false,
      loading:
        stores?.workspace?.current?.preview?.modes?.game?.loading || false,
      horizontalLayout: stores?.workspace?.current?.screen?.horizontalLayout,
    } as const),
  html: ({ context }) => {
    const { running, paused, debugging, loading, horizontalLayout } = context;
    const titleEl = () =>
      html`<s-box
        text-size="md"
        child-justify="center"
        text-align="center"
        grow
        inert
        >Game Preview</s-box
      >`;
    const modeButton = () => html`
      <s-button
        id="modeButton"
        aria-label="Preview Screenplay"
        variant="icon"
        icon="gamepad"
        width="48"
        height="48"
        class="more"
        color="fg-50"
      ></s-button>
    `;
    const settingsDropdown = () => html`
      <s-dropdown id="settingsDropdown">
        <s-button
          width="48"
          height="48"
          color="fg-50"
          variant="icon"
          icon="gear"
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
        icon="player-skip-backward-fill"
      ></s-button>
      <s-button
        id="fastBackwardButton"
        width="48"
        height="48"
        color="fg"
        variant="icon"
        icon="player-track-previous-fill"
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
    const loadingToolbar = () => html`
      <s-button
        id="runToggleButton"
        variant="text"
        width="48"
        height="44"
        text-size="2xs"
        child-layout="column"
        color="primary-70"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          fill="#3abff8"
        >
          <circle cx="4" cy="12" r="3">
            <animate
              id="spinner_qFRN"
              begin="0;spinner_OcgL.end+0.25s"
              attributeName="cy"
              calcMode="spline"
              dur="0.6s"
              values="12;6;12"
              keySplines=".33,.66,.66,1;.33,0,.66,.33"
            />
          </circle>
          <circle cx="12" cy="12" r="3">
            <animate
              begin="spinner_qFRN.begin+0.1s"
              attributeName="cy"
              calcMode="spline"
              dur="0.6s"
              values="12;6;12"
              keySplines=".33,.66,.66,1;.33,0,.66,.33"
            />
          </circle>
          <circle cx="20" cy="12" r="3">
            <animate
              id="spinner_OcgL"
              begin="spinner_qFRN.begin+0.2s"
              attributeName="cy"
              calcMode="spline"
              dur="0.6s"
              values="12;6;12"
              keySplines=".33,.66,.66,1;.33,0,.66,.33"
            />
          </circle>
        </svg>
      </s-button>
      <s-box grow inert></s-box>
      ${titleEl}
      <s-box grow inert></s-box>
      ${modeButton}
    `;
    const readyToolbar = () => html`
      <s-button
        id="runToggleButton"
        variant="text"
        width="48"
        height="48"
        text-size="2xs"
        child-layout="column"
        color="primary-70"
      >
        <s-icon
          icon-size="1.125rem"
          name="${running ? `player-stop` : `player-play`}"
        ></s-icon>
        ${running ? `STOP` : `PLAY`}
      </s-button>
      <s-box grow inert></s-box>
      ${running ? playbackControls : titleEl}
      <s-box grow inert></s-box>
      ${running ? settingsDropdown : modeButton}
    `;
    return html`
      <s-box
        bg-color="${horizontalLayout ? "panel" : "black"}"
        position="sticky-top"
      >
        <se-header-navigation-placeholder></se-header-navigation-placeholder>
        <s-box
          height="panel-nav"
          child-layout="row"
          child-align="center"
          bg-color="${horizontalLayout ? "panel" : "black"}"
          z="1"
          grow
        >
          <s-box
            text-size="md"
            child-layout="row"
            child-justify="center"
            child-align="center"
            grow
          >
            <s-list child-layout="row" child-justify="center" grow>
              ${loading ? loadingToolbar : readyToolbar}
            </s-list>
          </s-box>
        </s-box>
      </s-box>
    `;
  },
  selectors: {
    runToggleButton: null,
    modeButton: null,
    settingsDropdown: null,
    stepBackwardButton: null,
    fastBackwardButton: null,
    pauseToggleButton: null,
    fastForwardButton: null,
    stepForwardButton: null,
  } as const,
  css,
});
