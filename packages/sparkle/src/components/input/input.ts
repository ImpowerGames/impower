import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import getDependencyNameMap from "../../../../spark-element/src/utils/getDependencyNameMap";
import { getKeys } from "../../../../spark-element/src/utils/getKeys";
import getCssColor from "../../../../sparkle-style-transformer/src/utils/getCssColor";
import getCssMask from "../../../../sparkle-style-transformer/src/utils/getCssMask";
import {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import SparkleElement from "../../core/sparkle-element.js";
import type Ripple from "../ripple/ripple";
import component from "./_input";

const DEFAULT_DEPENDENCIES = getDependencyNameMap(["s-ripple"]);

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  "placeholder-color": getCssColor,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "type",
    "name",
    "value",
    "size",
    "readonly",
    "required",
    "pattern",
    "autocorrect",
    "autocomplete",
    "autofocus",
    "spellcheck",
    "label",
    "min",
    "max",
    "min-length",
    "max-length",
    "no-spin-buttons",
    "input-mode",
    "enter-key-hint",
    "default-value",
    ...getKeys(DEFAULT_TRANSFORMERS),
  ]),
};

export default class Input
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-input";

  static override dependencies = DEFAULT_DEPENDENCIES;

  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  static override async define(
    tagName?: string,
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get component() {
    return component({
      attrs: {
        type: this.type,
        name: this.name,
        autofocus: this.autofocus,
        autocomplete: this.autocomplete,
        autocorrect: this.autocorrect,
        autocapitalize: this.autocapitalize,
        spellcheck: this.spellcheck,
        maxLength: this.maxLength,
        minLength: this.minLength,
        pattern: this.pattern,
        label: this.label,
        enterKeyHint: this.enterKeyHint,
        inputMode: this.inputMode,
        readonly: this.readonly,
        required: this.required,
        defaultValue: this.defaultValue,
        value: this.value,
      },
    });
  }

  override transformHtml(html: string) {
    return Input.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  override transformCss(css: string) {
    return Input.augmentCss(css, DEFAULT_DEPENDENCIES);
  }
  /**
   * The type of input. Works the same as a native `<input>` element, but only a subset of types are supported. Defaults
   * to `text`.
   */
  get type():
    | "date"
    | "datetime-local"
    | "email"
    | "number"
    | "password"
    | "search"
    | "tel"
    | "text"
    | "time"
    | "url"
    | null {
    return this.getStringAttribute(Input.attributes.type);
  }
  set type(value) {
    this.setStringAttribute(Input.attributes.type, value);
  }

  /** The name of the input, submitted as a name/value pair with form data. */
  get name() {
    return this.getStringAttribute(Input.attributes.name);
  }
  set name(value) {
    this.setStringAttribute(Input.attributes.name, value);
  }

  /** Makes the input readonly. */
  get readonly() {
    return this.getBooleanAttribute(Input.attributes.readonly);
  }
  set readonly(value) {
    this.setBooleanAttribute(Input.attributes.readonly, value);
  }

  /** Makes the input a required field. */
  get required() {
    return this.getBooleanAttribute(Input.attributes.required);
  }
  set required(value) {
    this.setBooleanAttribute(Input.attributes.required, value);
  }

  /** Pattern the value must match to be valid. */
  get pattern():
    | "text"
    | "search"
    | "url"
    | "tel"
    | "email"
    | "password"
    | null {
    return this.getStringAttribute(Input.attributes.pattern);
  }
  set pattern(value) {
    this.setStringAttribute(Input.attributes.pattern, value);
  }

  /** Indicates whether the browser's autocorrect feature is on or off. */
  get autocorrect(): "off" | "on" | null {
    return this.getStringAttribute(Input.attributes.autocorrect);
  }
  set autocorrect(value) {
    this.setStringAttribute(Input.attributes.autocorrect, value);
  }

  /**
   * Specifies what permission the browser has to provide assistance in filling out form field values. Refer to
   * [this page on MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete) for available values.
   */
  get autocomplete() {
    return this.getStringAttribute(Input.attributes.autocomplete);
  }
  set autocomplete(value) {
    this.setStringAttribute(Input.attributes.autocomplete, value);
  }

  /** The input's minimum value. Only applies to date and number input types. */
  get min() {
    return this.getStringAttribute(Input.attributes.min);
  }
  set min(value) {
    this.setStringAttribute(Input.attributes.min, value);
  }

  /** The input's maximum value. Only applies to date and number input types. */
  get max() {
    return this.getStringAttribute(Input.attributes.max);
  }
  set max(value) {
    this.setStringAttribute(Input.attributes.max, value);
  }

  /** The minimum length of input that will be considered valid. */
  get minLength() {
    return this.getNumberAttribute(Input.attributes.minLength);
  }
  set minLength(value) {
    this.setNumberAttribute(Input.attributes.minLength, value);
  }

  /** The maximum length of input that will be considered valid. */
  get maxLength() {
    return this.getNumberAttribute(Input.attributes.maxLength);
  }
  set maxLength(value) {
    this.setNumberAttribute(Input.attributes.maxLength, value);
  }

  /** Don't display spin buttons in number field. */
  get noSpinButtons() {
    return this.getStringAttribute(Input.attributes.noSpinButtons);
  }
  set noSpinButtons(value) {
    this.setStringAttribute(Input.attributes.noSpinButtons, value);
  }

  /** The input's size. */
  get size(): "sm" | "md" | "lg" | null {
    return this.getStringAttribute(Input.attributes.size);
  }
  set size(value) {
    this.setStringAttribute(Input.attributes.size, value);
  }

  /** Label text to show as a hint when the input is empty. */
  get label() {
    return this.getStringAttribute(Input.attributes.label);
  }
  set label(value) {
    this.setStringAttribute(Input.attributes.label, value);
  }

  /** The current value of the input, submitted as a name/value pair with form data. */
  get value() {
    return this.getStringAttribute(Input.attributes.value);
  }
  set value(value) {
    this.setStringAttribute(Input.attributes.value, value);
  }

  /** The default value of the form control. Primarily used for resetting the form control. */
  get defaultValue() {
    return this.getStringAttribute(Input.attributes.defaultValue);
  }
  set defaultValue(value) {
    this.setStringAttribute(Input.attributes.defaultValue, value);
  }

  /** The color to use for the placeholder text. */
  get placeholderColor() {
    return this.getStringAttribute(Input.attributes.placeholderColor);
  }
  set placeholderColor(value) {
    this.setStringAttribute(Input.attributes.placeholderColor, value);
  }

  get inputEl() {
    return this.getElementByTag<HTMLInputElement>("input");
  }

  get rippleEl(): Ripple | null {
    return this.getElementByTag<Ripple>(Input.dependencies.ripple);
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Input.attributes.disabled) {
      const ripple = this.rippleEl;
      if (ripple) {
        ripple.hidden = newValue != null;
      }
    }
    if (name === Input.attributes.mask) {
      const ripple = this.rippleEl;
      if (ripple) {
        if (newValue) {
          const mask = getCssMask(newValue);
          ripple.root.style.webkitMask = mask;
          ripple.root.style.mask = mask;
        }
      }
    }
  }

  protected override onConnected(): void {
    this.rippleEl?.bind?.(this.root);
  }

  protected override onDisconnected(): void {
    this.rippleEl?.unbind?.(this.root);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sl-input": Input;
  }
}
