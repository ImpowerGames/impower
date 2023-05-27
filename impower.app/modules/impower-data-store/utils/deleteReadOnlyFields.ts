import getReadOnlyFields from "./getReadOnlyFields";

const deleteReadOnlyFields = <T extends Record<string, unknown>>(doc: T): T => {
  getReadOnlyFields().forEach((field) => {
    if (doc[field] !== undefined) {
      delete doc[field];
    }
  });
  return { ...doc };
};

export default deleteReadOnlyFields;
