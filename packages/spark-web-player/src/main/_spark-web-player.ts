import { html, spec } from "../../../spec-component/src/spec";
import resetCSS from "../styles/reset.css?inline";
import css from "./spark-web-player.css?inline";

export default spec({
  tag: "spark-web-player",
  props: {
    playLabel: "PLAY",
    playButton: false,
    toolbar: false,
  },
  selectors: {
    gameBackground: "#game-background",
    gameView: "#game-view",
    gameOverlay: "#game-overlay",
    game: "#game",
    playButton: "#play-button",
    toolbar: "#toolbar",
    leftItems: "#left-items",
    locationItems: "#location-items",
    launchStateIcon: "#launch-state-icon",
    launchButton: "#launch-button",
    launchLabel: "#launch-label",
    executedLabel: "#executed-label",
    sizeLabel: "#size-label",
    aspectRatioLabel: "#aspect-ratio-label",
    resetButton: "#reset-button",
    fullscreenButton: "#fullscreen-button",
  } as const,
  css: [resetCSS, css],
  html: ({ props }) => {
    const { toolbar, playButton, playLabel } = props;
    const toolbarComponent = () => html`
      <div id="toolbar">
        <div id="resize-handle"></div>
        <div id="left-items" hidden>
          <div id="location-items">
            <div id="launch-button" class="toolbar-button">
              <span id="launch-state-icon"></span>
              <span id="launch-label"></span>
            </div>
            <span id="executed-label"></span>
          </div>
          <div id="reset-button" class="toolbar-button">
            <div id="reset-icon"></div>
            Reset
          </div>
        </div>
        <div id="middle-items"></div>
        <div id="right-items">
          <div id="aspect-ratio-label"></div>
          <div id="size-label"></div>
          <div id="fullscreen-button" class="toolbar-button">
            <div id="fullscreen-icon"></div>
          </div>
        </div>
      </div>
    `;
    const playButtonComponent = () => html`
      <div id="play-button">
        <svg
          id="play-icon"
          xmlns="http://www.w3.org/2000/svg"
          width="512"
          height="512"
          viewBox="0 0 512 512"
        >
          <path
            fill="currentColor"
            d="M464 256a208 208 0 1 0-416 0a208 208 0 1 0 416 0M0 256a256 256 0 1 1 512 0a256 256 0 1 1-512 0m188.3-108.9c7.6-4.2 16.8-4.1 24.3.5l144 88c7.1 4.4 11.5 12.1 11.5 20.5s-4.4 16.1-11.5 20.5l-144 88c-7.4 4.5-16.7 4.7-24.3.5S176 352.9 176 344.2v-176c0-8.7 4.7-16.7 12.3-20.9z"
          />
        </svg>
        <div id="play-label">
          <slot>${playLabel}</slot>
        </div>
      </div>
    `;
    return html`
      <div id="viewport">
        <div id="game">
          <div id="game-background"></div>
          <div id="game-view"></div>
          <div id="game-overlay"></div>
          ${playButton ? playButtonComponent : ""}
        </div>
        ${toolbar ? toolbarComponent : ""}
      </div>
    `;
  },
});
