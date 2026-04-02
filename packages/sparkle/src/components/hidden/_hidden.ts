import { spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import { SizeName } from "../../types/sizeName";
import css from "./hidden.css";

export default spec({
  tag: "s-hidden",
  shadowDOM: false,
  props: {
    initial: null as string | null,
    hideBelow: null as SizeName | null,
    hideAbove: null as SizeName | null,
    ifBelow: null as SizeName | null,
    ifAbove: null as SizeName | null,
    hideEvent: null as string | null,
    showEvent: null as string | null,
    hideInstantly: null as string | null,
    showInstantly: null as string | null,
    hideDelay: null as string | null,
    showDelay: null as string | null,
  },
  css,
  sharedCSS,
});
