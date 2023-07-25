import css from "./button.css";
import html from "./button.html";

export default (state?: {
  attrs?: { type?: string | null; href?: string | null };
}) => ({
  css,
  html: state?.attrs?.href
    ? html.replace("<button ", "<a ").replace("</button>", "</a>")
    : state?.attrs?.type === "container"
    ? html.replace("<button ", "<div ").replace("</button>", "</div>")
    : html,
});
