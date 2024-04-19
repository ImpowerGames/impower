import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./hidden.css";

export default spec({
  tag: "s-hidden",
  props: {
    initial: null as string | null,
  },
  html: ({ props }) => {
    const { initial } = props;
    return html`
      <slot
        class="root"
        part="root"
        ${initial === "hide" ? "hidden" : ""}
      ></slot>
    `;
  },
  css: [...sharedCSS, css],
});
