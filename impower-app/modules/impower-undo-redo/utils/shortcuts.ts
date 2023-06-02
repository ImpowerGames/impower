export const isCtrlKeyPressed = (
  event: React.KeyboardEvent | KeyboardEvent
): boolean => {
  const isUsingWindows = navigator.platform.indexOf("Win") >= 0;
  return isUsingWindows ? event.ctrlKey : event.metaKey;
};

export const isShiftKeyPressed = (
  event: React.KeyboardEvent | KeyboardEvent
): boolean => event.shiftKey;

export const isUndoShortcut = (
  event: React.KeyboardEvent | KeyboardEvent
): boolean =>
  (!isShiftKeyPressed(event) &&
    isCtrlKeyPressed(event) &&
    event.key.toUpperCase() === "Z") ||
  (event.altKey && event.key === "Backspace");

export const isRedoShortcut = (
  event: React.KeyboardEvent | KeyboardEvent
): boolean =>
  (isCtrlKeyPressed(event) && event.key.toUpperCase() === "Y") ||
  (isCtrlKeyPressed(event) &&
    isShiftKeyPressed(event) &&
    event.key.toUpperCase() === "Z");
