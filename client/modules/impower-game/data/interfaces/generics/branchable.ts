export interface Branchable<T> {
  getContainerTargetIds(data: T): string[];
}

export const isBranchable = <T>(obj: unknown): obj is Branchable<T> => {
  if (!obj) {
    return false;
  }
  const branchable = obj as Branchable<T>;
  return branchable.getContainerTargetIds !== undefined;
};
