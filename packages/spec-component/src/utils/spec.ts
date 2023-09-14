import { ComponentConfig } from "../types/ComponentConfig";
import { ComponentSpec } from "../types/ComponentSpec";

const spec = <Props, State, Store>(
  spec: ComponentConfig<Props, State, Store>
): ComponentSpec<Props, State, Store> => {
  return {
    tag: spec.tag,
    context: spec.context,
    state: spec.state || (() => ({} as State)),
    props: spec.props || ({} as Props),
    html: (args: { props: Props; state: State; store?: Store }) =>
      typeof spec.html === "string" ? spec.html || "" : spec.html?.(args) || "",
    css: typeof spec.css === "string" ? [spec.css] : spec.css || [],
    shadowDOM: true,
  };
};

export default spec;
