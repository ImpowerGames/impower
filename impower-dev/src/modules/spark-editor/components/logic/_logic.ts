import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import WorkspaceContext from "../../workspace/WorkspaceContext";

export default spec({
  tag: "se-logic",
  context: WorkspaceContext.instance,
  css,
  html: ({ store }) => {
    const view = store?.panes?.logic?.view || "list";
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
