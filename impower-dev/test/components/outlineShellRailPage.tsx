import { useLayout } from "@impower/impower-ui/layout";
import { render } from "preact";
import type { DocumentSymbol } from "vscode-languageserver-protocol";
import WorkspaceShell from "../../src/modules/spark-editor/components/desktop-shell/WorkspaceShell";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const URI = "file://p/main.sd";

const span = (start: number, end: number) => ({
  start: { line: start, character: 0 },
  end: { line: end, character: 3 },
});

const scene = (index: number): DocumentSymbol => ({
  name: `scene_${index}`,
  kind: 5,
  range: span(index * 4, index * 4 + 3),
  selectionRange: span(index * 4, index * 4),
  children: [],
});

const SYMBOLS = Array.from({ length: 40 }, (_, index) => scene(index));

declare global {
  interface Window {
    shellRail: { caret: (line: number) => void };
  }
}

const caret = (line: number) => {
  const state = workspace.current;
  const logic = state.panes.logic;
  workspace.current = {
    ...state,
    panes: {
      ...state.panes,
      logic: {
        ...logic,
        panel: "main",
        panels: {
          ...logic.panels,
          main: {
            ...logic.panels.main,
            activeEditor: {
              open: true,
              filename: "main.sd",
              selectedRange: { start: { line, character: 1 }, end: { line, character: 1 } },
            },
          },
        },
      },
    },
  };
};

window.shellRail = { caret };

function Shell() {
  return (
    <WorkspaceShell phone={useLayout() === "phone"}>
      <div class="h-full w-full" />
    </WorkspaceShell>
  );
}

caret(0);
workspace.outline.value = { uri: URI, symbols: SYMBOLS, diagnostics: [], firstContentLine: 0 };
const host = document.body.appendChild(document.createElement("div"));
host.className = "flex h-screen flex-col";
render(<Shell />, host);
