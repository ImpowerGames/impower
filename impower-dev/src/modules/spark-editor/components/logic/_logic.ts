import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-logic",
  stores: { workspace },
  reducer: ({ stores }) =>
    ({
      view: stores?.workspace?.current?.panes?.logic?.view || "list",
    } as const),
  html: ({ context }) => {
    const { view } = context;
    return html`
      <s-router key="logic-view" active="${view}">
        <se-logic-list></se-logic-list>
        <template value="list">
          <se-logic-list></se-logic-list>
        </template>
        <template value="logic-editor">
          <se-logic-scripts-editor></se-logic-scripts-editor>
        </template>
      </s-router>
    `;
  },
  css,
});
