import { isTimestamp, RecursivePartial } from "../../impower-core";

const getSerializableDocument = <T>(doc: RecursivePartial<T>): T => {
  if (!doc) {
    return (doc || null) as T;
  }
  const result = { result: {} };
  const traverse = (d: unknown, o: unknown, k: string | number): void => {
    if (d && Array.isArray(d)) {
      const newO = [];
      for (let i = 0; i < d.length; i += 1) {
        newO[i] = d[i];
        traverse(d[i], newO, i);
      }
      o[k] = newO;
    } else if (d && isTimestamp(d)) {
      o[k] = d?.toDate()?.toJSON();
    } else if (d && typeof d === "object") {
      const newO = {};
      Object.keys(d).forEach((x) => {
        newO[x] = d[x];
        traverse(d[x], newO, x);
      });
      o[k] = newO;
    }
  };
  traverse(doc, result, "result");
  return (result.result || null) as T;
};

export default getSerializableDocument;
