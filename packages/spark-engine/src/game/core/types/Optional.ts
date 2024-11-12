export type Optional<T = any> = {
  [P in keyof Omit<T, "$type" | "$name">]?: T[P];
} & {
  [P in keyof Pick<T, Extract<keyof T, "$type">>]: T[P];
} & {
  [P in keyof Pick<T, Extract<keyof T, "$name">>]: "$optional";
};
