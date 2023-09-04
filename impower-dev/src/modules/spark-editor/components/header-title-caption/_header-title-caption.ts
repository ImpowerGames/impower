import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state: { store?: WorkspaceState }) => {
  const projectName = state?.store?.header?.projectName ?? "";
  const projectState = state?.store?.header?.projectState || "";
  const stateSkeleton = () => html`
    <s-skeleton id="name-skeleton">Saved to cache</s-skeleton>
  `;
  return {
    html: html`
      <s-box
        child-layout="row"
        child-align="center"
        text-size="sm"
        text-weight="500"
        m-b="2px"
        text-color="fg-60"
      >
        ${projectName && projectState ? projectState : stateSkeleton}
      </s-box>
    `,
  };
};
