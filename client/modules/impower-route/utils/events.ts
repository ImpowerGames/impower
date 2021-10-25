import { CSSProperties } from "react";

export type AccessibleEvent =
  | React.MouseEvent
  | React.KeyboardEvent
  | MouseEvent
  | KeyboardEvent;

export const isCtrlKeyPressed = (event: AccessibleEvent): boolean => {
  const isUsingWindows = navigator.platform.indexOf("Win") >= 0;
  return isUsingWindows ? event.ctrlKey : event.metaKey;
};

export const isShiftKeyPressed = (event: AccessibleEvent): boolean =>
  event.shiftKey;

export const onTap = (
  e: AccessibleEvent,
  preventDefault: boolean,
  wasDragging: boolean,
  action: () => void
): void => {
  // already used
  if (e.defaultPrevented) {
    return;
  }

  // is drag not tap
  if (wasDragging) {
    return;
  }

  if (preventDefault) {
    // marking the event as used
    e.preventDefault();
  }

  const element = e.currentTarget as HTMLElement;
  if (element) {
    element.focus();
  }

  action();
};

export const select = (
  e: AccessibleEvent,
  changeSelection: (e: AccessibleEvent) => string[],
  toggleSelection: (e: AccessibleEvent) => string[],
  multiSelection: (e: AccessibleEvent) => string[]
): string[] => {
  if (isCtrlKeyPressed(e)) {
    return toggleSelection(e);
  }

  if (isShiftKeyPressed(e)) {
    return multiSelection(e);
  }

  return changeSelection(e);
};

export const onSelect = (
  e: AccessibleEvent,
  onChangeSelection: (e: AccessibleEvent) => void,
  onToggleSelection: (e: AccessibleEvent) => void,
  onMultiSelection: (e: AccessibleEvent) => void
): void => {
  select(
    e,
    () => {
      onChangeSelection(e);
      return [];
    },
    () => {
      onToggleSelection(e);
      return [];
    },
    () => {
      onMultiSelection(e);
      return [];
    }
  );
};

export const onTapSelect = (
  e: AccessibleEvent,
  preventDefault: boolean,
  isDragging: boolean,
  toggleSelection: () => void,
  toggleSelectionInGroup: () => void,
  multiSelection: () => void
): void => {
  onTap(e, preventDefault, isDragging, () => {
    onSelect(e, toggleSelection, toggleSelectionInGroup, multiSelection);
  });
};

export interface TapButtonProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  role: string;
  tabIndex: number;
  style?: CSSProperties;
}

export interface TapToggleProps {
  "onMouseDown": (e: React.MouseEvent) => void;
  "onClick": (e: React.MouseEvent) => void;
  "role": string;
  "aria-checked": boolean;
  "tabIndex": number;
  "style"?: CSSProperties;
}

const tapStyle: CSSProperties = {
  cursor: "pointer",
  MozUserSelect: "none",
  WebkitUserSelect: "none",
  msUserSelect: "none",
  WebkitTapHighlightColor: "transparent",
};

export const onTapButton = (
  preventDefault: boolean,
  isDragging: boolean,
  action: (e: React.MouseEvent) => void,
  overridePointerStyle = true
): TapButtonProps => {
  return {
    onMouseDown: (e: React.MouseEvent): void => {
      e.preventDefault();
    },
    onClick: (e: React.MouseEvent): void => {
      onTap(e, preventDefault, isDragging, () => action(e));
    },
    role: "button",
    tabIndex: 0,
    ...(overridePointerStyle && {
      style: tapStyle,
    }),
  };
};

export const onTapToggle = (
  preventDefault: boolean,
  wasDragging: boolean,
  isSelected: boolean,
  action: (e: AccessibleEvent) => void,
  overridePointerStyle = true
): TapToggleProps => {
  return {
    "onMouseDown": (e: React.MouseEvent): void => {
      e.preventDefault();
    },
    "onClick": (e: React.MouseEvent): void => {
      onTap(e, preventDefault, wasDragging, () => action(e));
    },
    "role": "checkbox",
    "aria-checked": isSelected,
    "tabIndex": 0,
    ...(overridePointerStyle && {
      style: tapStyle,
    }),
  };
};

export const onTapSelectButton = (
  preventDefault: boolean,
  wasDragging: boolean,
  changeSelection: (e: AccessibleEvent) => void,
  toggleSelection: (e: AccessibleEvent) => void,
  multiSelection: (e: AccessibleEvent) => void,
  onClick: (e: React.MouseEvent) => void,
  overridePointerStyle = true
): TapButtonProps => {
  return onTapButton(
    preventDefault,
    wasDragging,
    (e: React.MouseEvent) => {
      onSelect(e, changeSelection, toggleSelection, multiSelection);
      onClick(e);
    },
    overridePointerStyle
  );
};

export const onTapSelectToggle = (
  preventDefault: boolean,
  isDragging: boolean,
  isSelected: boolean,
  toggleSelection: (e: AccessibleEvent) => void,
  multiSelection: (e: AccessibleEvent) => void,
  overridePointerStyle = true
): TapToggleProps => {
  return onTapToggle(
    preventDefault,
    isDragging,
    isSelected,
    (e: AccessibleEvent) => {
      onSelect(e, toggleSelection, toggleSelection, multiSelection);
    },
    overridePointerStyle
  );
};
