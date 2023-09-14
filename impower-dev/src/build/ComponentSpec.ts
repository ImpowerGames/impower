export interface ComponentSpec<
  Props = Record<string, unknown>,
  State = Record<string, unknown>,
  Store = Record<string, unknown>
> {
  tag: `${string}-${string}`;
  context?: { get: () => Store };
  state: (store?: Store) => State;
  props: Props;
  html: (args: { props: Props; state: State; store?: Store }) => string;
  css: string[];
  shadowDOM: boolean;
}
