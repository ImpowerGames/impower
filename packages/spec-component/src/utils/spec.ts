import { ComponentConfig } from "../types/ComponentConfig";
import { ComponentSpec } from "../types/ComponentSpec";
import { IStore } from "../types/IStore";

const spec = <
  Props extends Record<string, unknown>,
  Stores extends Record<string, IStore>,
  Context extends Record<string, unknown>,
  Graphics extends Record<string, string>,
  Selectors extends Record<string, null | string | string[]>
>(
  spec: ComponentConfig<Props, Stores, Context, Graphics, Selectors>
): ComponentSpec<Props, Stores, Context, Graphics, Selectors> => {
  return {
    tag: spec.tag,
    graphics: spec.graphics ?? ({} as Graphics),
    reducer: spec.reducer ?? (() => ({} as Context)),
    stores: spec.stores ?? ({} as Stores),
    props: spec.props ?? ({} as Props),
    css: typeof spec.css === "string" ? [spec.css] : spec.css || [],
    html: (args: {
      graphics: Graphics;
      stores: Stores;
      context: Context;
      props: Props;
    }) =>
      typeof spec.html === "string" ? spec.html || "" : spec.html?.(args) || "",
    selectors: spec.selectors ?? ({} as Selectors),
    shadowDOM: spec.shadowDOM ?? true,
  };
};

export default spec;
