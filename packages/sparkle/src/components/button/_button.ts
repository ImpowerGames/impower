import css from "./button.css";
import html from "./button.html";

export default (state?: { attrs?: { href?: string | null } }) => ({
  css,
  html: state?.attrs?.href
    ? html.replace("<button ", "<a ").replace("</button>", "</a>")
    : html,
});
