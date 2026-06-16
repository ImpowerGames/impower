import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import AnimationPlayer from "../../../../spark-dom/src/classes/AnimationPlayer";
import { getCSSPropertyKeyValue } from "../../../../spark-dom/src/utils/getCSSPropertyKeyValue";
import { getElementContent } from "../../../../spark-dom/src/utils/getElementContent";
import { getRevealAnimation } from "../../../../spark-dom/src/utils/getRevealAnimation";
import { TextInstruction } from "../../../../spark-engine/src/game/core/types/Instruction";
import { AnimateElementsMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/AnimateElementsMessage";
import { CreateElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/CreateElementMessage";
import { DestroyElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/DestroyElementMessage";
import { ObserveElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/ObserveElementMessage";
import { SetThemeMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/SetThemeMessage";
import { UnobserveElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/UnobserveElementMessage";
import { UpdateElementMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/UpdateElementMessage";
import { WriteTextMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
import { getCssEquivalent } from "../../../../sparkle-style-transformer/src/utils/getCssEquivalent";
import { Manager } from "../Manager";
import { getEventData } from "../utils/getEventData";

export default class UIManager extends Manager {
  protected _overlayRoots: HTMLElement[] = [];

  protected _breakpoints: Record<string, number> = {};

  protected _listeners: Record<string, (event: Event) => void> = {};

  override onDispose() {
    this._overlayRoots.forEach((el) => el.remove());
    this._listeners = {};
  }

  getElement(id: string | null | undefined) {
    if (!id) {
      return this.app.overlay;
    }
    return this.app.overlay?.querySelector(`#${id}`) as HTMLElement;
  }

  override async onReceiveRequest(msg: RequestMessage) {
    if (SetThemeMessage.type.isRequest(msg)) {
      const params = msg.params;
      this._breakpoints = params.breakpoints;
      return SetThemeMessage.type.result("");
    }
    if (CreateElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const el = document.createElement(params.type);
      if (params.element) {
        el.id = params.element;
      }
      if (params.name) {
        el.className = params.name;
      }
      if (params.content) {
        el.textContent = getElementContent(params.content, {
          breakpoints: params.breakpoints,
          scope: ":host #game",
        });
      }
      if (params.style) {
        el.style.cssText = Object.entries(params.style)
          .flatMap(([k, v]) => {
            const arr = [];
            if (v != null) {
              const [prop, value] = getCSSPropertyKeyValue(k, v);
              const cssEntries = getCssEquivalent(prop, value);
              for (const [k, v] of cssEntries) {
                arr.push(`${k}:${v}`);
              }
            }
            return arr;
          })
          .join(";");
      }
      if (params.attributes) {
        Object.entries(params.attributes).forEach(([k, v]) => {
          if (v != null) {
            el.setAttribute(k, v);
          }
        });
      }
      if (params.content && "fonts" in params.content) {
        for (const [, font] of Object.entries(params.content.fonts)) {
          try {
            if (font.font_family) {
              const fontFace = new FontFace(
                font.font_family,
                `url(${font.src})`,
                {
                  style: font.font_style || undefined,
                  weight: font.font_weight || undefined,
                  stretch: font.font_stretch || undefined,
                  display: (font.font_display as FontDisplay) || undefined,
                },
              );
              if (
                !Array.from(
                  document.fonts as unknown as Iterable<FontFace>,
                ).some(
                  (f) =>
                    f.family === font.font_family &&
                    f.style === font.font_style &&
                    f.weight === font.font_weight &&
                    f.stretch === font.font_stretch,
                )
              ) {
                if (
                  "add" in document.fonts &&
                  typeof document.fonts.add === "function"
                ) {
                  document.fonts.add(fontFace);
                }
                await fontFace.load();
              }
            }
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        const parent = this.getElement(params.parent);
        if (parent) {
          const appendedEl = parent.appendChild(el);
          if (parent === this.app.overlay) {
            this._overlayRoots.push(appendedEl);
          }
        }
      }
      return CreateElementMessage.type.result(params.element);
    }
    if (DestroyElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const element = this.getElement(params.element);
      if (element) {
        element.remove();
      }
      return DestroyElementMessage.type.result(params.element);
    }
    if (UpdateElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const element = this.getElement(params.element);
      if (element) {
        if (params.content != undefined) {
          element.textContent = getElementContent(params.content, {
            breakpoints: params.breakpoints,
            scope: ":host #game",
          });
        }
        if (params.attributes != undefined) {
          if (params.attributes) {
            Object.entries(params.attributes).forEach(([k, v]) => {
              if (v == null) {
                if (element) {
                  element.removeAttribute(k);
                }
              } else {
                if (element) {
                  element.setAttribute(k, v);
                }
              }
            });
          } else {
            Array.from(element.attributes).forEach((attr) =>
              element.removeAttribute(attr.name),
            );
          }
        }
        if (params.style != undefined) {
          if (params.style) {
            Object.entries(params.style).forEach(([k, v]) => {
              const [prop, value] = getCSSPropertyKeyValue(k, v);
              const cssEntries = getCssEquivalent(prop, value);
              if (v == null) {
                for (const [cssProp] of cssEntries) {
                  if (element) {
                    element.style.removeProperty(cssProp);
                  }
                }
              } else {
                for (const [cssProp, cssValue] of cssEntries) {
                  if (element) {
                    element.style.setProperty(cssProp, cssValue);
                  }
                }
              }
            });
          } else {
            element.style.cssText = "";
          }
        }
      }
      return UpdateElementMessage.type.result(params.element);
    }
    if (WriteTextMessage.type.isRequest(msg)) {
      const params = msg.params;
      await this.writeText(params.target, params.instructions, params.instant);
      return WriteTextMessage.type.result(params.target);
    }
    if (AnimateElementsMessage.type.isRequest(msg)) {
      const params = msg.params;
      const player = new AnimationPlayer();
      const validEffects: number[] = [];
      for (let i = 0; i < params.effects.length; i += 1) {
        const effect = params.effects[i];
        if (effect) {
          const element = this.getElement(effect.element);
          const animations = effect.animations;
          if (element) {
            player.add({ element, animations });
            validEffects.push(i);
          }
        }
      }
      await player.play();
      return AnimateElementsMessage.type.result(validEffects);
    }
    if (ObserveElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const el = this.getElement(params.element);
      if (el) {
        const listener = (event: Event) => {
          this.app.emit(EventMessage.type.notification(getEventData(event)));
        };
        this._listeners[params.element] = listener;
        el.addEventListener(params.event, listener);
      }
    }
    if (UnobserveElementMessage.type.isRequest(msg)) {
      const params = msg.params;
      const el = this.getElement(params.element);
      if (el) {
        const listener = this._listeners[params.element];
        if (listener) {
          el.removeEventListener(params.event, listener);
        }
      }
    }
    return undefined;
  }

  /**
   * Resolve a `target` selector (a className plus optional `#index`) to the
   * matching structural element(s) in the live DOM.
   *
   * Mirrors the engine's `UIModule.findElements`: it recursively collects
   * every element whose className includes the requested name, then (when an
   * `#index` instance suffix is present) narrows to that single occurrence.
   * The engine owns the `Element` tree and only forwards the original `target`
   * string, so the consumer re-resolves it here against the real DOM. (D13 may
   * later replace this with a consumer-side id→element map.)
   */
  protected findTargetElements(target: string): HTMLElement[] {
    const overlay = this.app.overlay;
    if (!overlay) {
      return [];
    }
    const [name, instance] = target.split("#");
    if (!name) {
      return [];
    }
    // The engine matches on *all* class tokens of a space-separated selector.
    const classes = name.split(" ").filter(Boolean);
    const selector = classes.map((c) => `.${CSS.escape(c)}`).join("");
    if (!selector) {
      return [];
    }
    const matches = Array.from(
      overlay.querySelectorAll(selector),
    ) as HTMLElement[];
    if (instance) {
      const instanceIndex = Number(instance);
      if (Number.isInteger(instanceIndex) && instanceIndex >= 0) {
        const el = matches[instanceIndex];
        return el ? [el] : [];
      }
      return [];
    }
    return matches;
  }

  /** Direct children of `parent` whose className includes `tag`. */
  protected getContentElements(parent: HTMLElement, tag: string): HTMLElement[] {
    return Array.from(parent.children).filter((c) =>
      c.className.split(" ").includes(tag),
    ) as HTMLElement[];
  }

  /** Apply an engine style map to a DOM element, matching the create/update path. */
  protected applyStyle(
    el: HTMLElement,
    style: Record<string, string | number | null>,
  ) {
    for (const [k, v] of Object.entries(style)) {
      const [prop, value] = getCSSPropertyKeyValue(k, v);
      const cssEntries = getCssEquivalent(prop, value);
      if (v == null) {
        for (const [cssProp] of cssEntries) {
          el.style.removeProperty(cssProp);
        }
      } else {
        for (const [cssProp, cssValue] of cssEntries) {
          el.style.setProperty(cssProp, cssValue);
        }
      }
    }
  }

  /**
   * [D14] Port of the engine's `UIModule.Text.process`, run against the real
   * DOM. Decomposes a `TextInstruction[]` into `text_line`/`text_word`/
   * `text_space`/`text_letter` spans (handling whitespace collapsing and
   * text-align line wrapping) under `contentEl`, and collects each new letter
   * span with its per-char `show` reveal animation so the caller can play them
   * all in one batch.
   */
  protected processText(
    contentEl: HTMLElement,
    sequence: TextInstruction[],
    instant: boolean,
    enter: { element: HTMLElement; animation: ReturnType<typeof getRevealAnimation> }[],
  ) {
    let lineWrapperEl: HTMLElement | undefined = undefined;
    let wordWrapperEl: HTMLElement | undefined = undefined;
    let wasSpace: boolean | undefined = undefined;
    let wasNewline: boolean | undefined = undefined;
    let prevTextAlign: string | undefined = undefined;
    const createEl = (
      parent: HTMLElement,
      type: string,
      name: string | undefined,
      style: Record<string, string | number | null> | undefined,
      text: string | undefined,
    ): HTMLElement => {
      const el = document.createElement(type);
      if (name) {
        el.className = name;
      }
      if (text != null) {
        el.textContent = text;
      }
      if (style) {
        this.applyStyle(el, style);
      }
      parent.appendChild(el);
      return el;
    };
    for (const e of sequence) {
      const text = e.text;
      // Wrap each line in a block div
      const isNewline = text === "\n";
      // Support transform animations and text-wrapping by wrapping each word in an inline-block span
      const isSpace = text === " " || text === "\t" || text === "\n";
      // Support aligning text by wrapping consecutive aligned chunks in a block div
      const textAlign = e.style?.text_align;
      const alignStyle = textAlign
        ? {
            text_align: textAlign,
          }
        : undefined;
      // text_align must be applied to a parent element
      if (textAlign !== prevTextAlign) {
        // Surround group consecutive spans that have the same text alignment a text_line div
        lineWrapperEl = createEl(
          contentEl,
          "div",
          "text_line",
          alignStyle,
          undefined,
        );
      } else if (wasNewline === undefined || isNewline !== wasNewline) {
        // Surround each line in a text_line div
        lineWrapperEl = createEl(
          contentEl,
          "div",
          "text_line",
          undefined,
          undefined,
        );
      }
      // Support consecutive whitespace collapsing
      const style: Record<string, string | number | null> = {
        display: null,
        opacity: "0",
        ...(e.style || {}),
      };
      if (text === "\n" || text === " " || text === "\t") {
        style["display"] = "inline";
      }
      if (text === "\n" || isSpace) {
        wordWrapperEl = createEl(
          lineWrapperEl || contentEl,
          "span",
          "text_space",
          alignStyle,
          undefined,
        );
      } else if (
        wasSpace === undefined ||
        isSpace !== wasSpace ||
        textAlign !== prevTextAlign
      ) {
        // this is the start of a new word chunk so create a text_word span
        wordWrapperEl = createEl(
          lineWrapperEl || contentEl,
          "span",
          "text_word",
          alignStyle,
          undefined,
        );
      }
      prevTextAlign = textAlign;
      wasNewline = isNewline;
      wasSpace = isSpace;
      // Append text to wordWrapper, blockWrapper, or content
      const textParentEl = wordWrapperEl || lineWrapperEl || contentEl;
      const newSpanEl = createEl(
        textParentEl,
        "span",
        "text_letter",
        style,
        text === "\n" ? "" : text, // text_line div already handles breaking up lines
      );
      enter.push({
        element: newSpanEl,
        animation: getRevealAnimation({ after: e.after, over: e.over }, instant),
      });
    }
  }

  /**
   * [D14] Consumer-side realization of a text write. Replaces the engine's
   * per-glyph `CreateElement` + per-letter `AnimateElements` emission: the
   * engine now sends a single `ui/write-text` carrying the `TextInstruction[]`,
   * and the consumer rebuilds the `text` + `stroke` content children and drives
   * the reveal here.
   */
  protected async writeText(
    target: string,
    instructions: TextInstruction[],
    instant: boolean,
  ) {
    const targetEls = this.findTargetElements(target);
    const enter: {
      element: HTMLElement;
      animation: ReturnType<typeof getRevealAnimation>;
    }[] = [];
    for (const targetEl of targetEls) {
      const textEls = this.getContentElements(targetEl, "text");
      const strokeEls = this.getContentElements(targetEl, "stroke");
      if (instructions.length > 0) {
        // Build text + stroke (the faux-outline duplicate) from the same
        // instructions, mirroring the engine's dual process() over both.
        // NOTE: a write APPENDS spans (matching the engine's old process(),
        // which never cleared first). Re-writes to the same non-transient
        // target accumulate; transient targets are emptied via the clear path
        // (empty instructions) before each new beat.
        for (const textEl of textEls) {
          this.processText(textEl, instructions, instant, enter);
        }
        for (const strokeEl of strokeEls) {
          this.processText(strokeEl, instructions, instant, enter);
        }
      } else {
        // Clear text + stroke (the `null`-sequence / clear path).
        for (const textEl of textEls) {
          textEl.replaceChildren();
        }
        for (const strokeEl of strokeEls) {
          strokeEl.replaceChildren();
        }
      }
    }
    if (enter.length > 0) {
      const player = new AnimationPlayer();
      for (const { element, animation } of enter) {
        player.add({ element, animations: [animation] });
      }
      await player.play();
    }
  }
}
