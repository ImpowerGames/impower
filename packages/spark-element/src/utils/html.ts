export const html = (
  strings: readonly string[] | ArrayLike<string>,
  ...rest: string[]
) => String.raw({ raw: strings }, ...rest);
