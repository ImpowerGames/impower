import Context from "../classes/Context";

export interface ComponentConfig<
  Props = Record<string, unknown>,
  State = Record<string, unknown>,
  Store = Record<string, unknown>
> {
  tag: `${string}-${string}`;
  context?: Context<Store>;
  state?: (store?: Store) => State;
  props?: Props;
  html?:
    | ((args: { props: Props; state: State; store?: Store }) => string)
    | string;
  css?: string[] | string;
  shadowDOM?: boolean;
}
