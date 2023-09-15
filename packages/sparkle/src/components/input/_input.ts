import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./input.css";

export default spec({
  tag: "s-input",
  props: {
    type: null as string | null,
    name: null as string | null,
    autofocus: false,
    autocomplete: null as string | null,
    autocorrect: null as string | null,
    autocapitalize: null as string | null,
    pattern: null as string | null,
    maxLength: 0 as number | null,
    minLength: 0 as number | null,
    label: null as string | null,
    enterKeyHint: null as string | null,
    inputMode: null as string | null,
    spellcheck: false,
    readonly: false,
    required: false,
    value: null as string | null,
  },
  html: ({ props }) => {
    const {
      type,
      name,
      autofocus,
      autocomplete,
      autocorrect,
      autocapitalize,
      pattern,
      maxLength,
      minLength,
      label,
      enterKeyHint,
      inputMode,
      spellcheck,
      readonly,
      required,
      value,
    } = props;
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
    const placeholderAttr = label ? () => html`placeholder="${label}"` : "";
    const inputmodeAttr = inputMode ? () => html`inputmode="${inputMode}"` : "";
    const enterkeyhintAttr = enterKeyHint
      ? () => html`enterkeyhint="${enterKeyHint}"`
      : "";
    const spellcheckAttr = spellcheck ? () => html`spellcheck="true"` : "";
    const readonlyAttr = readonly ? () => html`readonly` : "";
    const requiredAttr = required ? () => html`required` : "";
    const valueAttr = value ? () => html`value="${value}"` : "";
    const labelAttr = label ? () => html`aria-label="${label}"` : "";
    return html`
      <label class="root" part="root" ${labelAttr}>
        <div class="ripple" part="ripple">
          <slot name="ripple">
            <s-ripple id="ripple" animation="none"></s-ripple>
          </slot>
        </div>
        <span class="prefix" part="prefix">
          <slot name="prefix"></slot>
        </span>
        <input
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
          ${placeholderAttr}
          ${valueAttr}
        />
        <span class="suffix" part="suffix">
          <slot name="suffix"></slot>
        </span>
      </label>
    `;
  },
  selectors: {
    input: "input",
    ripple: "s-ripple",
  } as const,
  css: [...sharedCSS, css],
});
