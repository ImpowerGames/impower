type TagSeparator = "#" | "." | "[";

export type Ref<T> = T extends keyof HTMLElementTagNameMap
  ? HTMLElementTagNameMap[T]
  : T extends `${infer Tag}${TagSeparator}${infer _Selector}`
  ? Tag extends keyof HTMLElementTagNameMap
    ? HTMLElementTagNameMap[Tag]
    : HTMLElement
  : T extends string
  ? HTMLElement
  : HTMLElement | null;

export type RefMap<T> = {
  [K in keyof T]: T[K] extends Array<infer Item> ? Ref<Item>[] : Ref<T[K]>;
};
