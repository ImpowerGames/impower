import type { ClientRectObject, VirtualElement } from "../../../core";
export declare function getBoundingClientRect(
  element: Element | VirtualElement,
  includeScale?: boolean,
  isFixedStrategy?: boolean,
  offsetParent?: Element | Window
): ClientRectObject;
