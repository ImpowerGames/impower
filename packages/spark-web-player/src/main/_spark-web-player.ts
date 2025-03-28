import { html, spec } from "../../../spec-component/src/spec";
import css from "./spark-web-player.css";

export default spec({
  tag: "spark-web-player",
  props: {
    muted: false,
  },
  selectors: {
    gameBackground: "#game-background",
    gameView: "#game-view",
    gameOverlay: "#game-overlay",
    audioButton: "#audio-button",
  } as const,
  css,
  html: ({ props }) => {
    const { muted } = props;
    const audioButton = () => html`<div id="audio-button" part="audio-button">
      <div id="audio-icon">
        <svg
          id="audio-off-icon"
          part="audio-off-icon"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
        >
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15 8a5 5 0 0 1 1.912 4.934m-1.377 2.602a5 5 0 0 1 -.535 .464M17.7 5a9 9 0 0 1 2.362 11.086m-1.676 2.299a9 9 0 0 1 -.686 .615M9.069 5.054l.431 -.554a.8 .8 0 0 1 1.5 .5v2m0 4v8a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l1.294 -1.664M3 3l18 18"
          />
        </svg>
        <svg
          id="audio-on-icon"
          part="audio-on-icon"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
        >
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15 8a5 5 0 0 1 0 8M17.7 5a9 9 0 0 1 0 14"
          />
          <path
            fill="currentColor"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5"
          />
        </svg>
      </div>
    </div>`;
    return html`
      <div class="root" part="root">
        <div id="game" part="game">
          <div id="game-background" part="game-background"></div>
          <div id="game-view" part="game-view"></div>
          <div id="game-overlay" part="game-overlay"></div>
          ${muted ? audioButton : ""}
        </div>
      </div>
    `;
  },
});
