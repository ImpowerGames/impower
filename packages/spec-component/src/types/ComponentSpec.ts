export interface ComponentSpec<
  Props = Record<string, unknown>,
  State = Record<string, unknown>,
  Store = Record<string, unknown>
> {
  tag: `${string}-${string}`;
  props: Props;
  cache: { get: () => Store; set: (store: Store) => void };
  reducer: (store?: Store) => State;
  html: (context: { props: Props; state: State }) => string;
  css: string[];
  updateEvent: string;
}
