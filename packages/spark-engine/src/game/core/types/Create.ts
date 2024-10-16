export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? U[]
    : T[P] extends Function
    ? T[P]
    : T[P] extends object
    ? RecursivePartial<T[P]>
    : T[P];
};

export type Create<T = any> = (
  obj: RecursivePartial<T> & { $type?: string; $name: string }
) => T & { $type: string; $name: string };
