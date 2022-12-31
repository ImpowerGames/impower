import { traverse } from "./traverse";

export const getAllProperties = <T>(obj: T): Record<string, unknown> => {
  const props: Record<string, unknown> = {};
  traverse(obj, (path, v: any) => {
    props[path] = v;
  });
  return props;
};
