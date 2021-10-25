export const getEnumKeys = <E>(e: E): (keyof E)[] => {
  return Object.keys(e) as (keyof E)[];
};
