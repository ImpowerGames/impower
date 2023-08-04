import SparkleElement from "../../core/sparkle-element";
import { isFocusableElement } from "../../utils/isFocusableElement";
import { navEndKey } from "../../utils/navEndKey";
import { navNextKey } from "../../utils/navNextKey";
import { navPrevKey } from "../../utils/navPrevKey";
import { navStartKey } from "../../utils/navStartKey";
import component from "./_list";

/**
 * Lists allow the user to navigate children in an accessible way.
 */
export default class List extends SparkleElement {
  static override tagName = "s-list";

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  override transformCss(css: string) {
    return List.augmentCss(css);
  }

  get focusableChildren(): HTMLElement[] {
    if (this.shadowRoot) {
      const elements = this.contentSlot?.assignedElements({ flatten: true });
      if (elements) {
        return elements.filter(isFocusableElement);
      }
    }
    const elements = this.contentSlot?.children;
    if (elements) {
      return Array.from(elements).filter(isFocusableElement);
    }
    return [];
  }

  protected override onConnected(): void {
    this.bindNavigation();
  }

  protected override onDisconnected(): void {
    this.unbindNavigation();
  }

  bindNavigation() {
    const focusableChildren = this.focusableChildren;
    focusableChildren.forEach((child, index) => {
      child.role = "listitem";
      child.tabIndex = index === 0 ? 0 : -1;
      child.addEventListener("keydown", this.onKeyDown);
    });
  }

  unbindNavigation() {
    const focusableChildren = this.focusableChildren;
    focusableChildren.forEach((child) => {
      child.removeEventListener("keydown", this.onKeyDown);
    });
  }

  onKeyDown = (e: KeyboardEvent): void => {
    const target = e.currentTarget;
    if (target instanceof HTMLElement) {
      const dir = this.childLayout;
      switch (e.key) {
        case navPrevKey(dir):
          {
            e.preventDefault();
            this.focusPreviousChild(target);
          }
          break;
        case navNextKey(dir):
          {
            e.preventDefault();
            this.focusNextChild(target);
          }
          break;
        case navStartKey():
          {
            const focusableChildren = this.focusableChildren;
            const first = focusableChildren[0];
            if (first) {
              e.preventDefault();
              focusableChildren.forEach((child) => {
                child.tabIndex = child === first ? 0 : -1;
              });
              first.focus();
            }
          }
          break;
        case navEndKey():
          {
            const focusableChildren = this.focusableChildren;
            const last = focusableChildren[focusableChildren.length - 1];
            if (last) {
              e.preventDefault();
              focusableChildren.forEach((child) => {
                child.tabIndex = child === last ? 0 : -1;
              });
              last.focus();
            }
          }
          break;
        default:
          break;
      }
    }
  };

  focusPreviousChild(item: HTMLElement) {
    const focusableChildren = this.focusableChildren;
    const first = focusableChildren[0];
    const last = focusableChildren[focusableChildren.length - 1];
    if (item === first) {
      if (last) {
        focusableChildren.forEach((child) => {
          child.tabIndex = child === last ? 0 : -1;
        });
        last.focus();
      }
    } else {
      const index = focusableChildren.indexOf(item);
      const prev = focusableChildren[index - 1];
      if (prev) {
        focusableChildren.forEach((child) => {
          child.tabIndex = child === prev ? 0 : -1;
        });
        prev.focus();
      }
    }
  }

  focusNextChild(item: HTMLElement) {
    const focusableChildren = this.focusableChildren;
    const first = focusableChildren[0];
    const lastItem = focusableChildren[focusableChildren.length - 1];
    if (item === lastItem) {
      if (first) {
        focusableChildren.forEach((child) => {
          child.tabIndex = child === first ? 0 : -1;
        });
        first.focus();
      }
    } else {
      const index = focusableChildren.indexOf(item);
      const next = focusableChildren[index + 1];
      if (next) {
        focusableChildren.forEach((child) => {
          child.tabIndex = child === next ? 0 : -1;
        });
        next.focus();
      }
    }
  }

  protected override onContentAssigned(children: Element[]): void {
    this.unbindNavigation();
    this.bindNavigation();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-list": List;
  }
}
