/*!
 * Based on material-web ripple <https://github.com/material-components/material-web/blob/master/ripple/lib/ripple.ts>
 *
 * Copyright 2021 Google LLC
 * Released under the Apache-2.0 license.
 */

import SparkleEvent from "../../core/SparkleEvent.js";
import SparkleElement from "../../core/sparkle-element.js";
import { getDimensions } from "../../utils/getDimensions.js";
import css from "./ripple.css";
import html from "./ripple.html";

const PRESS_GROW_MS = 450;
const MINIMUM_PRESS_MS = 225;
const INITIAL_ORIGIN_SCALE = 0.2;
const PADDING = 10;
const SOFT_EDGE_MINIMUM_SIZE = 75;
const SOFT_EDGE_CONTAINER_RATIO = 0.35;
const PRESS_PSEUDO = "::after";
const PRESS_EASE = "cubic-bezier(0.2, 0, 0, 1)";
const ANIMATION_FILL = "forwards";

/**
 * Interaction states for the ripple.
 *
 * On Touch:
 *  - `INACTIVE -> TOUCH_DELAY -> WAITING_FOR_CLICK -> INACTIVE`
 *  - `INACTIVE -> TOUCH_DELAY -> HOLDING -> WAITING_FOR_CLICK -> INACTIVE`
 *
 * On Mouse or Pen:
 *   - `INACTIVE -> WAITING_FOR_CLICK -> INACTIVE`
 */
enum State {
  /**
   * Initial state of the control, no touch in progress.
   *
   * Transitions:
   *   - on touch down: transition to `TOUCH_DELAY`.
   *   - on mouse down: transition to `WAITING_FOR_CLICK`.
   */
  INACTIVE,
  /**
   * Touch down has been received, waiting to determine if it's a swipe or
   * scroll.
   *
   * Transitions:
   *   - on touch up: begin press; transition to `WAITING_FOR_CLICK`.
   *   - on cancel: transition to `INACTIVE`.
   *   - after `TOUCH_DELAY_MS`: begin press; transition to `HOLDING`.
   */
  TOUCH_DELAY,
  /**
   * A touch has been deemed to be a press
   *
   * Transitions:
   *  - on up: transition to `WAITING_FOR_CLICK`.
   */
  HOLDING,
  /**
   * The user touch has finished, transition into rest state.
   *
   * Transitions:
   *   - on click end press; transition to `INACTIVE`.
   */
  WAITING_FOR_CLICK,
}

/**
 * Delay reacting to touch so that we do not show the ripple for a swipe or
 * scroll interaction.
 */
const TOUCH_DELAY_MS = 150;

const styles = new CSSStyleSheet();
styles.replaceSync(css);

const focusedEvent = new SparkleEvent("focused");
const unfocusedEvent = new SparkleEvent("unfocused");
const hovered = new SparkleEvent("hovered");
const unhoveredEvent = new SparkleEvent("unhovered");
const pressedEvent = new SparkleEvent("pressed");
const unpressedEvent = new SparkleEvent("unpressed");

/**
 * A ripple component.
 */
export default class Ripple extends SparkleElement {
  static override tagName = "s-ripple";

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies);
  }

  override get html() {
    return html;
  }

  override get styles() {
    return [styles];
  }

  private _hovered = false;
  get hovered(): boolean {
    return this._hovered;
  }
  set hovered(value: boolean) {
    this._hovered = value;
    this.updateState();
    if (value) {
      this.dispatchEvent(hovered);
    } else {
      this.dispatchEvent(unhoveredEvent);
    }
  }

  private _focused = false;
  get focused(): boolean {
    return this._focused;
  }
  set focused(value: boolean) {
    this._focused = value;
    this.updateState();
    if (value) {
      this.dispatchEvent(focusedEvent);
    } else {
      this.dispatchEvent(unfocusedEvent);
    }
  }

  private _pressed = false;
  get pressed(): boolean {
    return this._pressed;
  }
  set pressed(value: boolean) {
    this._pressed = value;
    this.updateState();
    if (value) {
      this.dispatchEvent(pressedEvent);
    } else {
      this.dispatchEvent(unpressedEvent);
    }
  }

  private rippleSize = "";
  private rippleScale = "";
  private initialSize = 0;
  private growAnimation?: Animation;
  private state = State.INACTIVE;
  private rippleStartEvent?: PointerEvent;
  private checkBoundsAfterContextMenu = false;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === SparkleElement.attributes.hidden) {
      if (newValue != null) {
        this.hovered = false;
        this.focused = false;
        this.pressed = false;
      }
    }
  }

  updateState(): void {
    this.updateRootClass("hovered", this.hovered);
    this.updateRootClass("focused", this.focused);
    this.updateRootClass("pressed", this.pressed);
  }

  handlePointerEnter = (event: PointerEvent) => {
    if (!this.shouldReactToEvent(event)) {
      return;
    }

    this.hovered = true;
  };

  handlePointerLeave = (event: PointerEvent) => {
    if (!this.shouldReactToEvent(event)) {
      return;
    }

    this.hovered = false;

    // release a held mouse or pen press that moves outside the element
    if (this.state !== State.INACTIVE) {
      this.endPressAnimation();
    }
  };

  handleFocusIn = () => {
    this.focused = true;
  };

  handleFocusOut = () => {
    this.focused = false;
  };

  handlePointerUp = (event: PointerEvent) => {
    if (!this.shouldReactToEvent(event)) {
      return;
    }

    if (this.state === State.HOLDING) {
      this.state = State.WAITING_FOR_CLICK;
      return;
    }

    if (this.state === State.TOUCH_DELAY) {
      this.state = State.WAITING_FOR_CLICK;
      this.startPressAnimation(this.rippleStartEvent);
      return;
    }
  };

  handlePointerDown = async (event: PointerEvent) => {
    if (!this.shouldReactToEvent(event)) {
      return;
    }

    this.rippleStartEvent = event;
    if (!this.isTouch(event)) {
      this.state = State.WAITING_FOR_CLICK;
      this.startPressAnimation(event);
      return;
    }

    // after a longpress contextmenu event, an extra `pointerdown` can be
    // dispatched to the pressed element. Check that the down is within
    // bounds of the element in this case.
    if (this.checkBoundsAfterContextMenu && !this.inBounds(event)) {
      return;
    }

    this.checkBoundsAfterContextMenu = false;

    // Wait for a hold after touch delay
    this.state = State.TOUCH_DELAY;
    await new Promise((resolve) => {
      setTimeout(resolve, TOUCH_DELAY_MS);
    });

    if (this.state !== State.TOUCH_DELAY) {
      return;
    }

    this.state = State.HOLDING;
    this.startPressAnimation(event);
  };

  handleClick = () => {
    // Click is a MouseEvent in Firefox and Safari, so we cannot use
    // `shouldReactToEvent`
    if (this.state === State.WAITING_FOR_CLICK) {
      this.endPressAnimation();
      this.state = State.INACTIVE;
      return;
    }

    if (this.state === State.INACTIVE) {
      // keyboard synthesized click event
      this.startPressAnimation();
      this.endPressAnimation();
    }
  };

  handlePointerCancel = (event: PointerEvent) => {
    if (!this.shouldReactToEvent(event)) {
      return;
    }

    this.endPressAnimation();
  };

  handleContextMenu = () => {
    this.checkBoundsAfterContextMenu = true;
    this.endPressAnimation();
  };

  bind(element: HTMLElement) {
    element.addEventListener("click", this.handleClick);
    element.addEventListener("contextmenu", this.handleContextMenu);
    element.addEventListener("pointercancel", this.handlePointerCancel);
    element.addEventListener("pointerdown", this.handlePointerDown);
    element.addEventListener("pointerenter", this.handlePointerEnter);
    element.addEventListener("pointerleave", this.handlePointerLeave);
    element.addEventListener("pointerup", this.handlePointerUp);
  }

  unbind(element: HTMLElement) {
    element.removeEventListener("click", this.handleClick);
    element.removeEventListener("contextmenu", this.handleContextMenu);
    element.removeEventListener("pointercancel", this.handlePointerCancel);
    element.removeEventListener("pointerdown", this.handlePointerDown);
    element.removeEventListener("pointerenter", this.handlePointerEnter);
    element.removeEventListener("pointerleave", this.handlePointerLeave);
    element.removeEventListener("pointerup", this.handlePointerUp);
  }

  private determineRippleSize() {
    const { height, width } = getDimensions(this);
    const maxDim = Math.max(height, width);
    const softEdgeSize = Math.max(
      SOFT_EDGE_CONTAINER_RATIO * maxDim,
      SOFT_EDGE_MINIMUM_SIZE
    );

    let maxRadius = maxDim;
    let initialSize = Math.floor(maxDim * INITIAL_ORIGIN_SCALE);

    const hypotenuse = Math.sqrt(width ** 2 + height ** 2);
    maxRadius = hypotenuse + PADDING;

    this.initialSize = initialSize;
    this.rippleScale = `${(maxRadius + softEdgeSize) / initialSize}`;
    this.rippleSize = `${this.initialSize}px`;
  }

  private getNormalizedPointerEventCoords(pointerEvent: PointerEvent): {
    x: number;
    y: number;
  } {
    const { scrollX, scrollY } = window;
    const { left, top } = getDimensions(this);
    const documentX = scrollX + left;
    const documentY = scrollY + top;
    const { pageX, pageY } = pointerEvent;
    return { x: pageX - documentX, y: pageY - documentY };
  }

  private getTranslationCoordinates(positionEvent?: Event) {
    const { height, width } = getDimensions(this);
    // end in the center
    const endPoint = {
      x: (width - this.initialSize) / 2,
      y: (height - this.initialSize) / 2,
    };

    let startPoint;
    if (positionEvent instanceof PointerEvent) {
      startPoint = this.getNormalizedPointerEventCoords(positionEvent);
    } else {
      startPoint = {
        x: width / 2,
        y: height / 2,
      };
    }

    // center around start point
    startPoint = {
      x: startPoint.x - this.initialSize / 2,
      y: startPoint.y - this.initialSize / 2,
    };

    return { startPoint, endPoint };
  }

  private startPressAnimation(positionEvent?: Event) {
    this.pressed = true;
    this.growAnimation?.cancel();
    this.determineRippleSize();
    const { startPoint, endPoint } =
      this.getTranslationCoordinates(positionEvent);
    const translateStart = `${startPoint.x}px, ${startPoint.y}px`;
    const translateEnd = `${endPoint.x}px, ${endPoint.y}px`;

    this.growAnimation = this.root.animate(
      {
        top: [0, 0],
        left: [0, 0],
        height: [this.rippleSize, this.rippleSize],
        width: [this.rippleSize, this.rippleSize],
        transform: [
          `translate(${translateStart}) scale(1)`,
          `translate(${translateEnd}) scale(${this.rippleScale})`,
        ],
      },
      {
        pseudoElement: PRESS_PSEUDO,
        duration: PRESS_GROW_MS,
        easing: PRESS_EASE,
        fill: ANIMATION_FILL,
      }
    );
  }

  private async endPressAnimation() {
    const animation = this.growAnimation;
    const pressAnimationPlayState = animation?.currentTime ?? Infinity;
    if (pressAnimationPlayState >= MINIMUM_PRESS_MS) {
      this.pressed = false;
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, MINIMUM_PRESS_MS - pressAnimationPlayState);
    });

    if (this.growAnimation !== animation) {
      // A new press animation was started. The old animation was canceled and
      // should not finish the pressed state.
      return;
    }

    this.pressed = false;
  }

  /**
   * Returns `true` if
   *  - the ripple element is enabled
   *  - the pointer is primary for the input type
   *  - the pointer is the pointer that started the interaction, or will start
   * the interaction
   *  - the pointer is a touch, or the pointer state has the primary button
   * held, or the pointer is hovering
   */
  private shouldReactToEvent(event: PointerEvent) {
    if (!event.isPrimary) {
      return false;
    }

    if (
      this.rippleStartEvent &&
      this.rippleStartEvent.pointerId !== event.pointerId
    ) {
      return false;
    }

    if (event.type === "pointerenter" || event.type === "pointerleave") {
      return !this.isTouch(event);
    }

    const isPrimaryButton = event.buttons === 1;
    return this.isTouch(event) || isPrimaryButton;
  }

  /**
   * Check if the event is within the bounds of the element.
   *
   * This is only needed for the "stuck" contextmenu longpress on Chrome.
   */
  private inBounds({ x, y }: PointerEvent) {
    const { top, left, bottom, right } = this.getBoundingClientRect();
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  private isTouch({ pointerType }: PointerEvent) {
    return pointerType === "touch";
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-ripple": Ripple;
  }
  interface HTMLElementEventMap {
    focused: SparkleEvent;
    unfocused: SparkleEvent;
    hovered: SparkleEvent;
    unhovered: SparkleEvent;
    pressed: SparkleEvent;
    unpressed: SparkleEvent;
  }
}
