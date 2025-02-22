import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-file-item",
  stores: { workspace },
  props: { filename: "", renaming: false },
  html: ({ props }) => {
    const { filename, renaming } = props;
    const [name, ext] = filename.split(".");
    const nameComponent = () => (name ? html`<span>${name}</span>` : "");
    const extComponent = () =>
      ext && ext !== "sd" ? html`<span style="opacity:0.3">.${ext}</span>` : "";
    const nameInputComponent = () => html`<s-input
      display="inline-block"
      id="nameInput"
      child-justify="start"
      p="0 4"
      m="0 -4"
      placeholder-color="fab-bg"
      color="fg"
      value="${name || ""}"
      label="${name || ""}"
      size="sm"
      width="100%"
    ></s-input>`;
    const nameLabelComponent = () => html`${nameComponent}${extComponent}`;
    return html`
      <s-button
        id="button"
        class="root"
        width="100%"
        height="56"
        corner="0"
        variant="text"
        text-align="left"
        size="lg"
        color="fg-80"
        text-weight="normal"
        position="relative"
        content-visibility="auto"
        contain-intrinsic-size="auto none auto 56px"
      >
        <s-box
          position="absolute"
          i="0"
          child-layout="row"
          child-align="center"
        >
          <se-logic-diagnostics-label filename="${filename}">
            <s-box
              position="relative"
              height="100%"
              child-layout="row"
              child-align="center"
              grow
            >
              <s-box
                p="0 0 0 32"
                position="absolute"
                width="100%"
                text-overflow="ellipsis"
              >
                ${renaming ? nameInputComponent : nameLabelComponent}
              </s-box>
            </s-box>
          </se-logic-diagnostics-label>
          <se-file-options-button></se-file-options-button>
        </s-box>
      </s-button>
    `;
  },
  selectors: {
    button: "",
    nameInput: null,
  } as const,
  css,
});
