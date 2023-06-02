export interface IosNavigator extends Navigator {
  standalone: boolean; // ONLY AVAILABLE ON APPLE'S IOS SAFARI
}

export const isIosNavigator = (obj: unknown): obj is IosNavigator => {
  if (!obj) {
    return false;
  }
  const navigator = obj as IosNavigator;
  return navigator.standalone !== undefined;
};
