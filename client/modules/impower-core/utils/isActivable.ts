import { Activable } from "../types/interfaces/activable";

const isActivable = (obj: unknown): obj is Activable => {
  if (!obj) {
    return false;
  }
  const activable = obj as Activable;
  return activable.active !== undefined && activable.value !== undefined;
};

export default isActivable;
