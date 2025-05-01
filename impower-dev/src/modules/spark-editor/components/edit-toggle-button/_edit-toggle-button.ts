import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-edit-toggle-button",
  stores: { workspace },
  reducer: ({ stores }) => {
    const directory = stores?.workspace?.current?.project?.directory;
    const openedPane = stores?.workspace?.current?.pane;
    const openedPanel = stores?.workspace?.current?.panes?.[openedPane]?.panel;
    const activeEditor =
      stores?.workspace?.current?.panes?.[openedPane]?.panels?.[openedPanel]
        ?.activeEditor;
    const openedDocumentUri =
      directory && activeEditor?.open && activeEditor.filename
        ? directory + "/" + activeEditor.filename
        : undefined;
    return {
      openedDocumentUri,
    } as const;
  },
  html: ({ context }) => {
    const { openedDocumentUri } = context;
    const optionComponents = () =>
      openedDocumentUri
        ? html`
            <s-option id="searchOption" icon="search" value="search"
              >Find & Replace</s-option
            >
          `
        : "";
    return html`
      <s-dropdown id="menuDropdown" key="project-menu">
        <s-button
          id="menuButton"
          aria-label="Menu"
          variant="icon"
          icon="dots-vertical"
          width="56"
          height="56"
          color="fg-50"
        ></s-button>
        <slot slot="options"> ${optionComponents} </slot>
      </s-dropdown>

      <s-button
        id="doneButton"
        aria-label="Done"
        variant="icon"
        icon="check"
        width="56"
        height="56"
        color="primary-70"
        icon-size="1.25rem"
        hidden
      >
      </s-button>
    `;
  },
  css,
  selectors: {
    menuDropdown: "",
    doneButton: "",
  } as const,
});
