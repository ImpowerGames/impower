import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./dialog.css";
import html from "./dialog.html";

export default spec({
  tag: "s-dialog",
  html,
  selectors: {
    dialog: "dialog",
    icon: ".icon",
    label: ".label",
    cancel: ".cancel",
    confirm: ".confirm",
    labelSlot: "slot[name=label]",
    confirmSlot: "slot[name=confirm]",
    cancelSlot: "slot[name=cancel]",
  } as const,
  css: [...sharedCSS, css],
});
