import { html } from "../../../../spark-element/src/utils/html";
import css from "./input.css";

export default (state: {
  attrs: {
    type: string | null;
    name: string | null;
    autocomplete: string | null;
    autocorrect: string | null;
    autocapitalize: string | null;
    pattern: string | null;
    maxLength: number | null;
    minLength: number | null;
    label: string | null;
    enterKeyHint: string | null;
    inputMode: string | null;
    spellcheck: boolean;
    readonly: boolean;
    required: boolean;
    defaultValue: string | null;
    value: string | null;
  };
}) => {
  const label = state?.attrs?.label ?? "";
  const type = state?.attrs?.type ? `type="${state.attrs.type}"` : "";
  const name = state?.attrs?.name ? `name="${state.attrs.name}"` : "";
  const autocomplete = state?.attrs?.autocomplete
    ? `autocomplete="${state?.attrs?.autocomplete}"`
    : "";
  const autocorrect = state?.attrs?.autocorrect
    ? `autocorrect="${state?.attrs?.autocorrect}"`
    : "";
  const autocapitalize = state?.attrs?.autocapitalize
    ? `autocapitalize="${state?.attrs?.autocapitalize}"`
    : "";
  const pattern = state?.attrs?.pattern
    ? `pattern="${state.attrs.pattern}"`
    : "";
  const maxlength = state?.attrs?.maxLength
    ? `maxlength="${state.attrs.maxLength}"`
    : "";
  const minlength = state?.attrs?.minLength
    ? `minlength="${state.attrs.minLength}"`
    : "";
  const placeholder = label ? `placeholder="${label}"` : "";
  const inputmode = state?.attrs?.inputMode
    ? `inputmode="${state.attrs.inputMode}"`
    : "";
  const enterkeyhint = state?.attrs?.enterKeyHint
    ? `enterkeyhint="${state.attrs.enterKeyHint}"`
    : "";
  const spellcheck = state?.attrs?.spellcheck
    ? `spellcheck="${state.attrs.spellcheck}"`
    : "";
  const readonly = state?.attrs?.readonly ? "readonly" : "";
  const required = state?.attrs?.required ? "required" : "";
  const defaultValue = state?.attrs?.defaultValue || state?.attrs?.value;
  const value = defaultValue ? `value="${defaultValue}"` : "";
  return {
    css,
    html: html`
      <label class="root" part="root">
        <span class="prefix" part="prefix">
          <slot name="prefix"></slot>
        </span>
        <input
          id="form-control-input"
          class="input"
          part="input"
          ${type}
          ${name}
          ${autocomplete}
          ${autocorrect}
          ${autocapitalize}
          ${spellcheck}
          ${pattern}
          ${maxlength}
          ${minlength}
          ${inputmode}
          ${enterkeyhint}
          ${readonly}
          ${required}
          ${placeholder}
          ${value}
        />
        <span class="suffix" part="suffix">
          <slot name="suffix"></slot>
        </span>
      </label>
    `,
  };
};
