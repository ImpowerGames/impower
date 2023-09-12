import { ComponentConfig } from "../types/ComponentConfig";
import { ComponentSpec } from "../types/ComponentSpec";

const spec = <Props, State, Store>(
  spec: ComponentConfig<Props, State, Store>
): ComponentSpec<Props, State, Store> => {
  return {
    tag: spec.tag,
    props: spec.props || ({} as Props),
    cache: spec.cache || {
      get: () => ({} as Store),
      set: (store: Store) => {},
    },
    reducer: spec.reducer || (() => ({} as State)),
    html: (context: { props: Props; state: State }) =>
      typeof spec.html === "string"
        ? spec.html || ""
        : spec.html?.(context) || "",
    css: typeof spec.css === "string" ? [spec.css] : spec.css || [],
    updateEvent: spec.updateEvent || "update",
  };
};

export default spec;
