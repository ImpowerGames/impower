import { deleteProperty } from "./deleteProperty";
import { traverse } from "./traverse";

export const cull = <T>(obj: T, cullProp: string): void => {
  const deletePaths = new Set<string>();
  traverse(obj, (path, v) => {
    const activeProp = `.${cullProp}`;
    if (path.endsWith(activeProp) && typeof v === "boolean" && !v) {
      deletePaths.add(path.slice(0, -activeProp.length));
    }
  });
  deletePaths.forEach((path) => {
    deleteProperty(obj, path);
  });
};
