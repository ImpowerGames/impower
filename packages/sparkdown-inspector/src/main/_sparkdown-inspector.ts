/// <reference path="../declaration.d.ts" />
// The asset declarations above travel with this file, so a project that
// type-checks it through an import loads them too.
import { spec } from "../../../spec-component/src/spec";
import css from "./sparkdown-inspector.css";
import html from "./sparkdown-inspector.html";

export default spec({
  tag: "sparkdown-inspector",
  selectors: {
    editor: "#editor",
  } as const,
  css,
  html,
});
