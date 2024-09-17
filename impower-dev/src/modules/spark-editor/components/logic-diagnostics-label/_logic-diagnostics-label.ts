import type { Diagnostic } from "@impower/spark-editor-protocol/src/types";
import { html, spec } from "../../../../../../packages/spec-component/src/spec";
import css from "../../styles/shared";
import workspace from "../../workspace/WorkspaceStore";

export default spec({
  tag: "se-logic-diagnostics-label",
  stores: { workspace },
  props: {
    filename: "",
  },
  reducer: ({ props, stores }) => {
    const filename = props.filename;
    const diagnostics = stores?.workspace?.current?.debug?.diagnostics;
    const relevantDiagnostics: Diagnostic[] = [];
    if (diagnostics) {
      if (filename) {
        // Display diagnostics that match filename
        for (const [uri, fileDiagnostics] of Object.entries(diagnostics)) {
          if (uri.endsWith("/" + filename)) {
            relevantDiagnostics.push(...fileDiagnostics);
          }
        }
      } else {
        // If filename is not specified,
        // assume we are displaying diagnostics for all (non-main) scripts
        for (const [uri, fileDiagnostics] of Object.entries(diagnostics)) {
          if (!uri.endsWith("/" + "main.script")) {
            relevantDiagnostics.push(...fileDiagnostics);
          }
        }
      }
    }
    const count = relevantDiagnostics.length;
    const severity = Math.min(
      ...relevantDiagnostics.map((d) => d.severity ?? Infinity)
    );
    return {
      count,
      severity,
    } as const;
  },
  html: ({ context }) => {
    const { count, severity } = context;
    const color =
      count > 0
        ? severity === 1
          ? "danger"
          : severity === 2
          ? "warning"
          : undefined
        : undefined;
    const textColorAttr = color ? () => html`text-color="${color}"` : "";
    return html`
      <s-box child-layout="row" child-align="center" grow ${textColorAttr}>
        <slot></slot>
      </s-box>
    `;
  },
  css,
});
