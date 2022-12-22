import { traverse } from "./traverse";

export const getAllProperties = <T extends object>(
  obj: T
): Record<string, unknown> => {
  const props: Record<string, unknown> = {};
  traverse(obj, (path, v: any) => {
    props[path] = v;
  });
  return props;
};
