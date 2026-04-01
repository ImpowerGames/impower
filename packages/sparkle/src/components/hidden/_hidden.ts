import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./hidden.css";

export default spec({
  tag: "s-hidden",
  props: {
    initial: null as string | null,
    hideBelow: null as string | null,
    hideAbove: null as string | null,
    ifBelow: null as string | null,
    ifAbove: null as string | null,
    hideEvent: null as string | null,
    showEvent: null as string | null,
    hideInstantly: null as string | null,
    showInstantly: null as string | null,
    hideDelay: null as string | null,
    showDelay: null as string | null,
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
  css,
  sharedCSS,
});
