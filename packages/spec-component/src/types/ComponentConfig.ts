import { IStore } from "../types/IStore";

export interface ComponentConfig<
  Props extends Record<string, unknown>,
  State extends Record<string, unknown>,
  Stores extends Record<string, IStore>,
  Context extends Record<string, unknown>,
  Selectors extends Record<string, null | string | string[]>
> {
  tag: `${string}-${string}`;
  stores?: Stores;
  context?: (stores: Stores) => Context;
  state?: State;
  props?: Props;
  css?: string[] | string;
  html?:
    | ((args: {
        stores: Stores;
        context: Context;
        state: State;
        props: Props;
      }) => string)
    | string;
  selectors?: Selectors;
  shadowDOM?: boolean;
  updateStateEvent?: string;
}
