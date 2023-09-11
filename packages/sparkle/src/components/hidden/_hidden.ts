import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./hidden.css";

export default spec({
  tag: "s-hidden",
  css: [...sharedCSS, css],
  props: {
    initial: null as string | null,
  },
  html: ({ props }) => {
    const { initial } = props;
    return html`
      <div class="root" part="root" ${initial === "hide" ? "hidden" : ""}>
        <slot></slot>
      </div>
    `;
  },
});
