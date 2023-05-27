import { Identifiable } from "../types/interfaces/identifiable";

const isIdentifiable = (obj: unknown): obj is Identifiable => {
  if (!obj) {
    return false;
  }
  const identifiable = obj as Identifiable;
  return identifiable.id !== undefined;
};

export default isIdentifiable;
