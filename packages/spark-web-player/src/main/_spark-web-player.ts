import { spec } from "../../../spec-component/src/spec";
import css from "./spark-web-player.css";
import html from "./spark-web-player.html";

export default spec({
  tag: "spark-web-player",
  html,
  selectors: {
    gameBackground: "#game-background",
    gameView: "#game-view",
    gameOverlay: "#game-overlay",
  } as const,
  css,
});
