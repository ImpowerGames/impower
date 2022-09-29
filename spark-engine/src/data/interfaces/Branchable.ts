export interface Branchable<T> {
  getContainerTargetNames(data: T): string[];
}
