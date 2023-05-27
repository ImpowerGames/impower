import { Nameable } from "../types/interfaces/nameable";

const isNameable = (obj: unknown): obj is Nameable => {
  if (!obj) {
    return false;
  }
  const nameable = obj as Nameable;
  return nameable.name !== undefined;
};

export default isNameable;
