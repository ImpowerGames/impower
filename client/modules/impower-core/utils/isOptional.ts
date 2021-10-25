import { Optional } from "../types/interfaces/optional";

const isOptional = (obj: unknown): obj is Optional => {
  if (!obj) {
    return false;
  }
  const optional = obj as Optional;
  return optional.useDefault !== undefined && optional.value !== undefined;
};

export default isOptional;
