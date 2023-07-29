import { html } from "../../../../../../packages/spark-element/src/utils/html";

export default (state: { attrs?: { "directory-path": string | null } }) => {
  const directoryPath = state?.attrs?.["directory-path"] || "";
  return {
    html: html`
      <s-button
        class="root"
        id="item"
        p="0 32"
        width="100%"
        height="56"
        corner="0"
        variant="text"
        size="lg"
        color="fg-80"
        text-weight="normal"
        child-justify="between"
        value="${directoryPath}"
        grow
      >
        <slot></slot>
        <s-box m-r="-24">
          <se-file-options-button></se-file-options-button>
        </s-box>
      </s-button>
    `,
  };
};
