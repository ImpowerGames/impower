import { IStore } from "../types/IStore";

export interface ComponentSpec<
  Props extends Record<string, unknown>,
  Stores extends Record<string, IStore>,
  Context extends Record<string, unknown>,
  Graphics extends Record<string, string>,
  Selectors extends Record<string, null | string | string[]>
> {
  tag: `${string}-${string}`;
  props: Props;
  stores: Stores;
  graphics: Graphics;
  reducer: (args: { props: Props; stores: Stores }) => Context;
  css: string[];
  html: (args: {
    props: Props;
    stores: Stores;
    context: Context;
    graphics: Graphics;
  }) => string;
  selectors: Selectors;
  shadowDOM: boolean;
}
