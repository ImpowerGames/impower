import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./dropdown.css";
import html from "./dropdown.html";

export default spec({
  tag: "s-dropdown",
  html,
  selectors: {
    dialog: "dialog",
    option: "s-option",
    optionsSlot: "slot[name=options]",
  } as const,
  css: [...sharedCSS, css],
});
