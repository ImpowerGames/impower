let keyboard = false;

if (typeof document !== "undefined") {
  document.addEventListener("keydown", () => {
    keyboard = true;
  }, true);
  document.addEventListener("pointerdown", () => {
    keyboard = false;
  }, true);
}

const TEXT_ENTRY =
  'textarea, [contenteditable]:not([contenteditable="false"]), input:not([type="button"], [type="checkbox"], [type="color"], [type="file"], [type="image"], [type="radio"], [type="range"], [type="reset"], [type="submit"])';

export const lastInputWasKeyboard = () => keyboard;

type FocusVisibleOptions = FocusOptions & { focusVisible?: boolean };

export const focusAsInput = (target: HTMLElement, focus: FocusOptions = {}) => {
  if (target.matches(TEXT_ENTRY)) {
    target.focus(focus);
    return;
  }
  const options: FocusVisibleOptions = { ...focus, focusVisible: keyboard };
  target.focus(options);
};
