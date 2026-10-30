/*
 * Based on material-web <https://github.com/material-components/material-web>
 *
 * Copyright 2021 Google LLC
 * Released under the Apache-2.0 license.
 */

import { isServer } from "./isServer";

interface StrongFocus {
  visible: boolean;
  setVisible(visible: boolean): void;
}

class FocusGlobal implements StrongFocus {
  visible = false;
  setVisible(visible: boolean) {
    this.visible = visible;
  }
}

let focusObject: StrongFocus = new FocusGlobal();

const KEYBOARD_NAVIGATION_KEYS = new Set([
  "Tab",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);

export function keydownHandler(e: KeyboardEvent) {
  if (KEYBOARD_NAVIGATION_KEYS.has(e.key)) {
    focusObject.setVisible(true);
  }
}

export function setup(focusGlobal: StrongFocus, enableKeydownHandler = false) {
  focusObject = focusGlobal;

  if (isServer()) {
    return;
  }

  if (enableKeydownHandler) {
    window.addEventListener("keydown", keydownHandler);
  } else {
    window.removeEventListener("keydown", keydownHandler);
  }
}

let alwaysStrong = false;

export function shouldShowStrongFocus() {
  return alwaysStrong || focusObject.visible;
}

export function setForceStrongFocus(force: boolean) {
  alwaysStrong = force;
}

export function isStrongFocusForced() {
  return alwaysStrong;
}

export function pointerPress() {
  focusObject.setVisible(false);
}

setup(focusObject, true);
