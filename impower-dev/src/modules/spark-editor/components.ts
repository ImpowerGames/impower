import transformer from "../../../../packages/sparkle-style-transformer/src/index";
import sparklePatternsCSS from "../../../../packages/sparkle/src/styles/patterns/patterns.css";
import { ComponentSpec } from "../../../../packages/spec-component/src/spec";
import baseNormalize from "../../../../packages/spec-component/src/styles/normalize/normalize.css";
import Demo from "./components/demo/_demo";
import OptionButton from "./components/option-button/_option-button";
import Scrollable from "./components/scrollable/_scrollable";
import editorNormalize from "./styles/normalize/normalize.css";
import editorTheme from "./styles/theme/theme.css";

const config = {
  patterns: [sparklePatternsCSS],
};

const style = <
  Props extends Record<string, unknown> = Record<string, unknown>,
  Stores extends Record<string, any> = Record<string, any>,
  Context extends Record<string, unknown> = Record<string, unknown>,
  Graphics extends Record<string, string> = Record<string, string>,
  Selectors extends Record<string, null | string | string[]> = Record<
    string,
    null | string | string[]
  >,
>(
  spec: ComponentSpec<Props, Stores, Context, Graphics, Selectors>,
): ComponentSpec<Props, Stores, Context, Graphics, Selectors> => {
  return {
    ...spec,
    html: (args) => {
      const content = spec.html(args);
      return transformer(content, config);
    },
  };
};

const components = [
  { tag: "", css: baseNormalize },
  { tag: "", css: editorNormalize },
  { tag: "", css: editorTheme },
  style(Scrollable),
  style(OptionButton),
  style(Demo),
] as const;

export default components;
