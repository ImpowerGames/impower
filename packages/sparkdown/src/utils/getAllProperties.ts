import traverse from "./traverse";

const getAllProperties = <T>(
  obj: T,
  isLeaf?: (fieldPath: string, fieldValue: unknown) => boolean
): Record<string, unknown> => {
  const props: Record<string, unknown> = {};
  traverse(
    obj,
    (path, v) => {
      props[path] = v;
    },
    isLeaf
  );
  return props;
};

export default getAllProperties;
