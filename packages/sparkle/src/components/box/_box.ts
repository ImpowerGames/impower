import { spec } from "../../../../spec-component/src/spec";
import { scopeSelectorsToHost } from "../../../../spec-component/src/utils/scopeSelectorsToHost";
import sharedCSS from "../../styles/shared";
import utility from "../../styles/utility/utility.css";
import css from "./box.css";

export default spec({
  tag: "s-box",
  css: css + "\n" + scopeSelectorsToHost(utility),
  sharedCSS,
  shadowDOM: false,
});
