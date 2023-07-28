import { html } from "../../../../spark-element/src/utils/html";
import css from "./hidden.css";

export default (state?: {
  attrs?: {
    initial: string | null;
  };
}) => {
  const initial = state?.attrs?.initial;
  return {
    css,
    html: html`
      <div class="root" part="root" ${initial === "hide" ? "hidden" : ""}>
        <slot></slot>
      </div>
    `,
  };
};
