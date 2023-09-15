import { ComponentConfig } from "../types/ComponentConfig";
import { ComponentSpec } from "../types/ComponentSpec";
import { IStore } from "../types/IStore";

const spec = <
  Props extends Record<string, unknown>,
  State extends Record<string, unknown>,
  Stores extends Record<string, IStore>,
  Context extends Record<string, unknown>,
  Selectors extends Record<string, null | string | string[]>
>(
  spec: ComponentConfig<Props, State, Stores, Context, Selectors>
): ComponentSpec<Props, State, Stores, Context, Selectors> => {
  return {
    tag: spec.tag,
    stores: spec.stores ?? ({} as Stores),
    context: spec.context ?? (() => ({} as Context)),
    state: spec.state ?? ({} as State),
    props: spec.props ?? ({} as Props),
    css: typeof spec.css === "string" ? [spec.css] : spec.css || [],
    html: (args: {
      stores: Stores;
      context: Context;
      state: State;
      props: Props;
    }) =>
      typeof spec.html === "string" ? spec.html || "" : spec.html?.(args) || "",
    selectors: spec.selectors ?? ({} as Selectors),
    shadowDOM: spec.shadowDOM ?? true,
    updateStateEvent: spec.updateStateEvent ?? "update:state",
  };
};

export default spec;
