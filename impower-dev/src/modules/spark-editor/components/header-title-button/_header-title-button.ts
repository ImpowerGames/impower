import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state: { store?: WorkspaceState }) => {
  // TODO: Re-render when received message to change header from WorkspaceWindow
  const label = "Project Name";
  const name = state?.store?.header?.projectName ?? "";
  const editingName = state?.store?.header?.editingProjectName;
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
  return {
    html: html`
      <s-box child-layout="row" child-align="center" height="28">
        ${name ? (editingName ? nameInput : nameButton) : nameSkeleton}
      </s-box>
    `,
  };
};
