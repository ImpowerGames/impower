/* eslint-disable dot-notation */
import { difference, isCollection, RecursivePartial } from "../../impower-core";

const getUpdatedFields = <T>(
  data: RecursivePartial<T>,
  current: RecursivePartial<T> | null = null,
  separator = "."
): { [fieldPath: string]: unknown } => {
  const updatedFields: { [fieldPath: string]: unknown } = {};
  const traverse = (d: unknown, c: unknown, fieldPath: string): void => {
    if (d && isCollection(d) && isCollection(c) && d.data && c.data) {
      const newIds = Object.keys(d.data);
      const oldIds = Object.keys(c.data);
      const removedIds = difference(oldIds, newIds);
      const addedIds = difference(newIds, oldIds);
      const unchangedIds = newIds.filter(
        (id) => !removedIds.includes(id) && !addedIds.includes(id)
      );
      if (removedIds) {
        removedIds.forEach((id) => {
          const removedFieldPath = `${fieldPath}${separator}data${separator}${id}`;
          updatedFields[removedFieldPath] = null;
        });
      }
      if (addedIds) {
        addedIds.forEach((id) => {
          const addedFieldPath = `${fieldPath}${separator}data${separator}${id}`;
          updatedFields[addedFieldPath] = d.data[id];
        });
      }
      if (unchangedIds) {
        unchangedIds.forEach((id) => {
          const unchangedFieldPath = `${fieldPath}${separator}data${separator}${id}`;
          traverse(d.data[id], c?.data?.[id], unchangedFieldPath);
        });
      }
    } else if (d && !Array.isArray(d) && typeof d === "object") {
      const newKeys = Object.keys(d);
      if (newKeys.length > 0) {
        newKeys.forEach((x) => {
          const nextFieldPath = fieldPath ? `${fieldPath}${separator}${x}` : x;
          traverse(d[x], c?.[x], nextFieldPath);
        });
      } else if (d !== c) {
        updatedFields[fieldPath] = d;
      }
    } else if (d === null || d !== c) {
      updatedFields[fieldPath] = d;
    }
  };
  traverse(data, current, "");
  return updatedFields;
};

export default getUpdatedFields;
