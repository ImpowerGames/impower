import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./icon.css";

export default spec({
  tag: "s-icon",
  shadowDOM: false,
  html: ({ props, graphics }) => {
    const { name } = props;
    const svg = () => (typeof name === "string" ? graphics?.[name] || "" : "");
    return html`${svg}`;
  },
  css,
  sharedCSS,
  props: {
    name: null as string | null,
    iconSize: null as string | null,
  },
});
