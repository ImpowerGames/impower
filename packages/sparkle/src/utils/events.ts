/*
 * Based on material-web <https://github.com/material-components/material-web>
 *
 * Copyright 2021 Google LLC
 * Released under the Apache-2.0 license.
 */

export const redispatchEvent = (element: Element, event: Event) => {
  if (event.bubbles && (!element.shadowRoot || event.composed)) {
    event.stopPropagation();
  }

  const copy = Reflect.construct(event.constructor, [event.type, event]);
  const dispatched = element.dispatchEvent(copy);
  if (!dispatched) {
    event.preventDefault();
  }

  return dispatched;
};

export const dispatchActivationClick = (element: HTMLElement) => {
  const event = new MouseEvent("click", { bubbles: true });
  element.dispatchEvent(event);
  return event;
};

export const isActivationClick = (event: Event) => {
  if (event.currentTarget !== event.target) {
    return false;
  }
  if (event.composedPath()[0] !== event.target) {
    return false;
  }
  if ((event.target as EventTarget & { disabled: boolean }).disabled) {
    return false;
  }
  return !squelchEvent(event);
};

const squelchEvent = (event: Event) => {
  const squelched = isSquelchingEvents;
  if (squelched) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  squelchEventsForMicrotask();
  return squelched;
};

let isSquelchingEvents = false;
const squelchEventsForMicrotask = async () => {
  isSquelchingEvents = true;
  await null;
  isSquelchingEvents = false;
};

export const waitForEvent = (el: HTMLElement, eventName: string) => {
  return new Promise<void>((resolve) => {
    const done = (event: Event) => {
      if (event.target === el) {
        el.removeEventListener(eventName, done);
        resolve();
      }
    };

    el.addEventListener(eventName, done);
  });
};
