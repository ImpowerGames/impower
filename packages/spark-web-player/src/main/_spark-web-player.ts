import { html, spec } from "../../../spec-component/src/spec";
import css from "./spark-web-player.css";

export default spec({
  tag: "spark-web-player",
  props: {
    playLabel: "PLAY",
    toolbar: "",
  },
  selectors: {
    gameBackground: "#game-background",
    gameView: "#game-view",
    gameOverlay: "#game-overlay",
    playButton: "#play-button",
    launchStateIcon: "#launch-state-icon",
    launchLabel: "#launch-label",
  } as const,
  css,
  html: ({ props }) => {
    const { playLabel, toolbar } = props;
    const toolbarComponent = () => html`
      <div id="toolbar">
        <span id="launch-state-icon" class="icon"></span>
        <span class="spacer"></span>
        <span id="launch-label"></span>
      </div>
    `;
    return html`
      <div class="root" part="root">
        <div id="game" part="game">
          <div id="game-background" part="game-background"></div>
          <div id="game-view" part="game-view"></div>
          <div id="game-overlay" part="game-overlay"></div>
          <div id="play-button" part="play-button">
            <svg
              id="play-icon"
              part="play-icon"
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
            <div id="play-label" part="play-label">
              <slot>${playLabel}</slot>
            </div>
          </div>
        </div>
        ${toolbar != null ? toolbarComponent : ""}
      </div>
    `;
  },
});
