import { WorkspaceStore } from "@impower/spark-editor-protocol/src/types";
import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";

export default spec({
  tag: "se-logic",
  css,
  cache: WorkspaceCache,
  reducer: (store?: WorkspaceStore) => ({
    view: store?.panes?.logic?.view || "list",
  }),
  html: ({ state }) => {
    const { view } = state;
    return html`
      <s-router key="logic-view" active="${view}">
        <template value="list">
          <se-logic-list></se-logic-list>
        </template>
        <template value="logic-editor">
          <se-logic-scripts-editor></se-logic-scripts-editor>
        </template>
      </s-router>
    `;
  },
});
