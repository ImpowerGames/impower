export interface ComponentSpec<
  Props = Record<string, unknown>,
  State = Record<string, unknown>,
  Store = Record<string, unknown>
> {
  tag: `${string}-${string}`;
  props?: Props;
  cache?: () => Store;
  reducer?: (store?: Store) => State;
  html?: ((context: { props: Props; state: State }) => string) | string;
  css?: string[] | string;
  updateEvent?: string;
}
