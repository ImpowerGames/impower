import { html } from "../../../../spark-element/src/utils/html";
import css from "./input.css";

export default (state: {
  attrs: {
    type: string | null;
    name: string | null;
    autofocus: boolean;
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
  const type = state?.attrs?.type ?? "";
  const name = state?.attrs?.name ?? "";
  const autofocus = state?.attrs?.autofocus ?? "";
  const autocomplete = state?.attrs?.autocomplete ?? "";
  const autocorrect = state?.attrs?.autocorrect ?? "";
  const autocapitalize = state?.attrs?.autocapitalize ?? "";
  const pattern = state?.attrs?.pattern ?? "";
  const maxLength = state?.attrs?.maxLength ?? "";
  const minLength = state?.attrs?.minLength ?? "";
  const inputMode = state?.attrs?.inputMode ?? "";
  const enterKeyHint = state?.attrs?.enterKeyHint ?? "";
  const spellcheck = (state?.attrs?.spellcheck ? "true" : "false") ?? "";
  const readonly = state?.attrs?.readonly ?? "";
  const required = state?.attrs?.required ?? "";
  const defaultValue = state?.attrs?.defaultValue || state?.attrs?.value || "";
  const typeAttr = type ? () => html`type="${type}"` : "";
  const nameAttr = name ? () => html`name="${name}"` : "";
  const autofocusAttr = autofocus ? () => html`autofocus` : "";
  const autocompleteAttr = autocomplete
    ? () => html`autocomplete="${autocomplete}"`
    : "";
  const autocorrectAttr = autocorrect
    ? () => html`autocorrect="${autocorrect}"`
    : "";
  const autocapitalizeAttr = autocapitalize
    ? () => html`autocapitalize="${autocapitalize}"`
    : "";
  const patternAttr = pattern ? () => html`pattern="${pattern}"` : "";
  const maxlengthAttr = maxLength ? () => html`maxlength="${maxLength}"` : "";
  const minlengthAttr = minLength ? () => html`minlength="${minLength}"` : "";
  const placeholder = label ? () => html`placeholder="${label}"` : "";
  const inputmodeAttr = inputMode ? () => html`inputmode="${inputMode}"` : "";
  const enterkeyhintAttr = enterKeyHint
    ? () => html`enterkeyhint="${enterKeyHint}"`
    : "";
  const spellcheckAttr = spellcheck
    ? () => html`spellcheck="${spellcheck}"`
    : "";
  const readonlyAttr = readonly ? () => html`readonly` : "";
  const requiredAttr = required ? () => html`required` : "";
  const valueAttr = defaultValue ? () => html`value="${defaultValue}"` : "";
  return {
    css,
    html: html`
      <label class="root" part="root" aria-label="${label}">
        <div class="ripple" part="ripple">
          <slot name="ripple">
            <s-ripple animation="none"></s-ripple>
          </slot>
        </div>
        <span class="prefix" part="prefix">
          <slot name="prefix"></slot>
        </span>
        <input
          id="form-control-input"
          class="input"
          part="input"
          ${typeAttr}
          ${nameAttr}
          ${autofocusAttr}
          ${autocompleteAttr}
          ${autocorrectAttr}
          ${autocapitalizeAttr}
          ${spellcheckAttr}
          ${patternAttr}
          ${maxlengthAttr}
          ${minlengthAttr}
          ${inputmodeAttr}
          ${enterkeyhintAttr}
          ${readonlyAttr}
          ${requiredAttr}
          ${placeholder}
          ${valueAttr}
        />
        <span class="suffix" part="suffix">
          <slot name="suffix"></slot>
        </span>
      </label>
    `,
  };
};
