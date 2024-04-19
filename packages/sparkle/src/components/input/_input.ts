import { html, spec } from "../../../../spec-component/src/spec";
import sharedCSS from "../../styles/shared";
import css from "./input.css";

export default spec({
  tag: "s-input",
  props: {
    type: null as string | null,
    name: null as string | null,
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
    ripple: null as string | null,
  },
  html: ({ props }) => {
    const {
      type,
      name,
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
      ripple,
    } = props;
    const typeAttr = type ? () => html`type="${type}"` : "";
    const nameAttr = name ? () => html`name="${name}"` : "";
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
    const rippleAttr = ripple ? () => html`animation="${ripple}"` : "";
    return html`
      <label class="root" part="root" ${labelAttr}>
        <s-ripple class="ripple" part="ripple" ${rippleAttr}></s-ripple>
        <slot name="prefix" class="prefix" part="prefix"></slot>
        <input
          class="input"
          part="input"
          ${typeAttr}
          ${nameAttr}
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
        <slot name="suffix" class="suffix" part="suffix"></slot>
      </label>
    `;
  },
  selectors: {
    input: "input",
    ripple: "s-ripple",
  } as const,
  css: [...sharedCSS, css],
});
