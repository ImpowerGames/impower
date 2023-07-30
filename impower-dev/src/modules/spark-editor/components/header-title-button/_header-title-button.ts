import { html } from "../../../../../../packages/spark-element/src/utils/html";
import { WorkspaceState } from "../../workspace/types/WorkspaceState";

export default (state: { store?: WorkspaceState }) => {
  // TODO: Re-render when received message to change header from WorkspaceWindow
  const title = state?.store?.header?.title || "Untitled Project";
  return {
    html: html`
      <s-button
        variant="text"
        text-size="lg"
        text-weight="500"
        color="fg"
        p="0 4"
        m="0 -4"
        self-align="start"
      >
        ${title ? title : `<s-skeleton>Untitled Project</s-skeleton>`}
      </s-button>
    `,
  };
};
