import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-file-item",
  stores: { workspace },
  props: { filename: "", name: "", ext: "" },
  html: ({ props }) => {
    const { name, ext } = props;
    return html`
      <s-button
        id="button"
        class="root"
        id="item"
        width="100%"
        height="56"
        corner="0"
        variant="text"
        text-align="left"
        size="lg"
        color="fg-80"
        text-weight="normal"
        position="relative"
        value="logic-editor"
      >
        <s-box
          position="absolute"
          i="0"
          child-layout="row"
          child-align="center"
        >
          <s-box
            position="relative"
            height="100%"
            child-layout="row"
            child-align="center"
            grow
          >
            <s-box p="0 0 0 32" position="absolute" text-overflow="ellipsis">
              <span>${name}</span><span style="opacity:0.3">.${ext}</span>
            </s-box>
          </s-box>
          <se-file-options-button></se-file-options-button>
        </s-box>
      </s-button>
    `;
  },
  selectors: {
    button: "",
  } as const,
  css,
});
