import { Scope } from "../enums/scope";
import { Permission } from "../enums/permission";

export interface Scopable {
  scope: Scope;
  permission: Permission;
  overrideParentContainerId: string;
}

export const isScopable = (obj: unknown): obj is Scopable => {
  if (!obj) {
    return false;
  }
  const scopable = obj as Scopable;
  return (
    scopable.scope !== undefined &&
    scopable.permission !== undefined &&
    scopable.overrideParentContainerId !== undefined
  );
};
