export interface ComponentSpec<
  Props extends Record<string, unknown> = Record<string, unknown>,
  State extends Record<string, unknown> = Record<string, unknown>,
  Stores extends Record<string, { current: any }> = Record<
    string,
    { current: any }
  >,
  Context extends Record<string, unknown> = Record<string, unknown>,
  Selectors extends Record<string, null | string | string[]> = Record<
    string,
    null | string | string[]
  >
> {
  tag: `${string}-${string}`;
  stores: Stores;
  context: (stores: Stores) => Context;
  state: State;
  props: Props;
  css: string[];
  html?: (args: {
    stores: Stores;
    context: Context;
    state: State;
    props: Props;
  }) => string;
  selectors: Selectors;
  shadowDOM: boolean;
  updateStateEvent: string;
}
