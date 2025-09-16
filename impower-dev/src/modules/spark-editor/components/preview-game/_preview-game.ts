import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";
import css from "./preview-game.css";

const SPARKDOWN_PLAYER_ORIGIN =
  process?.env?.["VITE_SPARKDOWN_PLAYER_ORIGIN"] || "";

export default spec({
  tag: "se-preview-game",
  stores: { workspace },
  selectors: { iframe: "" },
  html: () => {
    return html`
      <se-preview-game-toolbar></se-preview-game-toolbar>
      <s-box position="relative" grow>
        <iframe
          id="iframe"
          src="${SPARKDOWN_PLAYER_ORIGIN}/"
          sandbox="allow-scripts allow-forms allow-same-origin"
          allow="autoplay"
          referrerpolicy="no-referrer"
          style="visibility:hidden;"
          onload="this.style.visibility = 'visible';"
        ></iframe>
      </s-box>
    `;
  },
  css: [...sharedCSS, css],
});
