import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./icon.css";

export default spec({
  tag: "s-icon",
  props: {
    name: null as string | null,
  },
  html: ({ props, graphics }) => {
    const { name } = props;
    const svg = () => (typeof name === "string" ? graphics?.[name] || "" : "");
    return html`<div class="root icon" part="root"><slot>${svg}</slot></div>`;
  },
  css: [...sharedCSS, css],
});
