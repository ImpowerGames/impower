import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/core/core.css";
import sharedCSS from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-file-options-button",
  stores: { workspace },
  props: { filename: "" },
  html: ({ props }) => {
    const { filename } = props;
    const popupId = "--popup-" + filename.replaceAll(".", "-");
    return html`
      <s-box anchor-id="${popupId}">
        <s-button
          aria-label="Options"
          variant="icon"
          icon="dots-vertical"
          width="40"
          height="40"
          id="more"
          color="fg-50"
          m-r="8"
        ></s-button>
      </s-box>
      <s-box
        key="file-options"
        anchor-to="${popupId}"
        anchor-interaction="click"
        a-t="bottom"
        a-l="left"
        c="8"
        p="8 0"
        bg-color="popup"
        text-color="fg"
      >
        <s-option id="renameOption" icon="pencil" value="rename"
          >Rename</s-option
        >
        <s-option id="deleteOption" icon="trash" value="delete"
          >Delete</s-option
        >
      </s-box>
    `;
  },
  selectors: {
    deleteOption: "",
    renameOption: "",
  } as const,
  css,
  sharedCSS,
});
