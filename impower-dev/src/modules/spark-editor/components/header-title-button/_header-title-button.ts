import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-header-title-button",
  stores: { workspace },
  reducer: ({ workspace }) =>
    ({
      name: workspace?.current?.project?.name || "",
      syncState: workspace?.current?.project?.syncState || "",
      editingName: workspace?.current?.project?.editingName || false,
    } as const),
  html: ({ context }) => {
    const { name, syncState, editingName } = context;
    const label = "Project Name";
    const nameButton = () => html`
      <s-button
        id="nameButton"
        variant="text"
        height-min="0"
        text-overflow="ellipsis"
        text-align="left"
        text-size="lg"
        text-weight="500"
        color="fg"
        p="0 4"
        m="0 -4"
      >
        ${name}
      </s-button>
    `;
    const nameInput = () => html`
      <s-input
        id="nameInput"
        child-justify="start"
        text-size="lg"
        text-weight="500"
        p="0 4"
        m="0 -4"
        placeholder-color="fab-bg"
        color="fg"
        value="${name}"
        label="${label}"
        size="sm"
        width="100%"
      ></s-input>
    `;
    const nameSkeleton = () => html`
      <s-skeleton id="name-skeleton">Untitled Game</s-skeleton>
    `;
    return html`
      <s-box child-layout="row" child-align="center">
        <s-box position="relative" height="28" width-max="600" grow>
          <s-box position="absolute" i="0">
            ${name && syncState
              ? editingName
                ? nameInput
                : nameButton
              : nameSkeleton}
          </s-box>
        </s-box>
      </s-box>
    `;
  },
  selectors: {
    nameButton: null,
    nameInput: null,
  } as const,
  css,
});
