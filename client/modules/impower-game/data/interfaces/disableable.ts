export interface Disableable {
  disabled: boolean;
}

export const isDisableable = (obj: unknown): obj is Disableable => {
  if (!obj) {
    return false;
  }
  const disableable = obj as Disableable;
  return disableable.disabled !== undefined;
};
