import _mergeWith from "lodash/fp/mergeWith";
import isList from "./isList";

const assignValues = <T>(current: T, update: T, deleteUndefined = true): T => {
  const customizer = (
    objValue,
    srcValue,
    _key,
    _obj,
    _src,
    _stack
  ): unknown => {
    if (objValue && srcValue && typeof objValue !== typeof srcValue) {
      return objValue;
    }
    return undefined;
  };
  const merged = _mergeWith(customizer, current, update);

  const traverse = (
    c: unknown,
    u: unknown,
    cParent: unknown,
    uParent: unknown,
    field: string,
    parentField: string,
    fieldPath: string
  ): void => {
    if (
      cParent &&
      c === undefined &&
      !Array.isArray(cParent) &&
      parentField !== "data" &&
      !field?.startsWith("_")
    ) {
      if (deleteUndefined) {
        delete uParent[field];
      }
    }
    if (u && isList(u) && isList(c) && u.default) {
      const keys = Object.keys(u.data);
      keys.forEach((x) => {
        u.data[x] = _mergeWith(customizer, u.default, u.data[x]);
      });
    }
    if (u && Array.isArray(u)) {
      u.forEach((v, index) => {
        const nextFieldPath = fieldPath
          ? `${fieldPath}.${index}`
          : index.toString();
        traverse(
          c?.[index],
          u[index],
          c,
          u,
          index.toString(),
          field,
          nextFieldPath
        );
      });
    } else if (u && typeof u === "object") {
      const keys = Object.keys(u);
      keys.forEach((x) => {
        const nextFieldPath = fieldPath ? `${fieldPath}.${x}` : x;
        traverse(c?.[x], u[x], c, u, x, field, nextFieldPath);
      });
    }
  };
  traverse(current, merged, undefined, undefined, "", "", "");
  return merged;
};

export default assignValues;
