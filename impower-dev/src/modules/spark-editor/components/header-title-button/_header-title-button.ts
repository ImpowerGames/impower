import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-header-title-button",
  stores: { workspace },
  reducer: ({ stores }) =>
    ({
      name: stores?.workspace?.current?.project?.name || "",
      syncState: stores?.workspace?.current?.sync?.status || "",
      editingName: stores?.workspace?.current?.screen?.editingName || false,
    } as const),
  html: ({ context }) => {
    const { name, syncState, editingName } = context;
    const label = "Project Name";
    const bgColorAttr = editingName ? "" : () => html`bg-color="none"`;
    const nameInput = () => html`
      <s-input
        id="nameInput"
        -child-justify="start"
        -text-size="lg"
        -text-weight="500"
        -p="0 4"
        -m="0 -4"
        placeholder-color="fab-bg"
        color="fg"
        ${bgColorAttr}
        value="${name}"
        label="${label}"
        size="sm"
        -width="100%"
      ></s-input>
    `;
    const nameSkeleton = () => html`
      <s-skeleton id="name-skeleton">Untitled Game</s-skeleton>
    `;
    return html`
      <s-box -child-layout="row" -child-align="center">
        <s-box -position="relative" -height="28" -width-max="600" -grow>
          <s-box -position="absolute" -i="0">
            ${name && syncState ? nameInput : nameSkeleton}
          </s-box>
        </s-box>
      </s-box>
    `;
  },
  selectors: {
    nameInput: null,
  } as const,
  css,
});
