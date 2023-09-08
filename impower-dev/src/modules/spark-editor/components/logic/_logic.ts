import { WorkspaceState } from "@impower/spark-editor-protocol/src/types";
import { html } from "../../../../../../packages/spark-element/src/utils/html";

export default (state: { store?: WorkspaceState }) => {
  const view = state?.store?.panes?.logic?.view || "list";
  return {
    html: html`
      <s-router key="logic-view" active="${view}">
        <template value="list">
          <se-logic-list></se-logic-list>
        </template>
        <template value="logic-editor">
          <se-logic-scripts-editor></se-logic-scripts-editor>
        </template>
      </s-router>
    `,
  };
};
