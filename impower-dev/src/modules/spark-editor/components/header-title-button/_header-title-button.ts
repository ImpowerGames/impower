import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";

export default spec({
  tag: "se-header-title-button",
  css,
  cache: WorkspaceCache,
  reducer: (store?: WorkspaceStore) => ({
    name: store?.project?.name || "",
    syncState: store?.project?.syncState || "",
    editingName: store?.project?.editingName || false,
  }),
  html: ({ state }) => {
    const { name, syncState, editingName } = state;
    const label = "Project Name";
    const nameButton = () => html`
      <s-button
        id="name-button"
        variant="text"
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
        id="name-input"
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
      <s-skeleton id="name-skeleton">Untitled Project</s-skeleton>
    `;
    return html`
      <s-box child-layout="row" child-align="center" height="28">
        ${name && syncState
          ? editingName
            ? nameInput
            : nameButton
          : nameSkeleton}
      </s-box>
    `;
  },
});
