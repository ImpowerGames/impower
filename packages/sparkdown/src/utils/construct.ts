import setProperty from "./setProperty";

const build = <T>(
  obj: T,
  structs: {
    [name: string]: {
      base: string;
      fields: Record<string, { value: unknown }>;
    };
  },
  name: string
): void => {
  const struct = structs?.[name];
  if (!struct) {
    return;
  }
  if (struct.base) {
    build(obj, structs, struct.base);
  }
  Object.entries(struct?.fields || {}).forEach(([path, field]) => {
    const val = field.value;
    if (val && typeof val === "object") {
      const nestedStructName = (val as { name: string }).name;
      const struct = structs[nestedStructName];
      if (struct) {
        const newObj = {};
        setProperty(obj, path, newObj);
        build(newObj, structs, nestedStructName);
      }
    } else {
      setProperty(obj, path, field.value);
    }
  });
};

const construct = <T>(
  defaultObject: T,
  structs: {
    [name: string]: {
      base: string;
      fields: Record<string, { value: unknown }>;
    };
  },
  name: string
): T => {
  const obj = JSON.parse(JSON.stringify(defaultObject));
  build(obj, structs, name);
  return obj as T;
};

export default construct;
