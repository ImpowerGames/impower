import { Panel, EditorView, ViewUpdate, showPanel } from "@codemirror/view";
import {
  openLintPanel,
  closeLintPanel,
  forEachDiagnostic,
} from "@codemirror/lint";
import { openGotoLinePanel } from "./GotoLinePanel";
import EDITOR_COLORS from "../constants/EDITOR_COLORS";

export class StatusPanel implements Panel {
  dom: HTMLElement;

  problemsButton: HTMLButtonElement;

  problemsToggleIcon: HTMLSpanElement;

  errorsLabel: HTMLSpanElement;

  warningsLabel: HTMLSpanElement;

  infosLabel: HTMLSpanElement;

  gotoLineButton: HTMLButtonElement;

  lineColumnLabel: HTMLSpanElement;

  isLintPanelOpen = false;

  constructor(readonly view: EditorView) {
    this.dom = document.createElement("div");
    this.dom.className = "cm-status";

    this.problemsButton = document.createElement("button");
    this.problemsButton.className = "cm-button";
    this.problemsButton.name = "problems";
    this.problemsButton.type = "button";
    this.problemsButton.onclick = this.toggleLintPanel.bind(this);

    this.problemsToggleIcon = document.createElement("span");
    this.problemsToggleIcon.className = "cm-statusIcon cm-problemsToggleIcon";

    this.errorsLabel = document.createElement("span");
    this.errorsLabel.className = "cm-statusLabel cm-errorsLabel";

    this.warningsLabel = document.createElement("span");
    this.warningsLabel.className = "cm-statusLabel cm-warningsLabel";

    this.infosLabel = document.createElement("span");
    this.infosLabel.className = "cm-statusLabel cm-infosLabel";

    this.gotoLineButton = document.createElement("button");
    this.gotoLineButton.className = "cm-button";
    this.gotoLineButton.name = "problems";
    this.gotoLineButton.type = "button";
    this.gotoLineButton.onclick = this.gotoLine.bind(this);

    this.lineColumnLabel = document.createElement("span");
    this.lineColumnLabel.className = "cm-statusLabel cm-lineColumnLabel";

    this.dom.appendChild(this.problemsButton);
    this.problemsButton.appendChild(this.problemsToggleIcon);
    this.problemsButton.appendChild(this.errorsLabel);
    this.problemsButton.appendChild(this.warningsLabel);
    this.problemsButton.appendChild(this.infosLabel);

    this.dom.appendChild(this.gotoLineButton);
    this.gotoLineButton.appendChild(this.lineColumnLabel);
  }

  toggleLintPanel() {
    if (this.isLintPanelOpen) {
      closeLintPanel(this.view);
      this.problemsToggleIcon.classList.remove("open");
    } else {
      openLintPanel(this.view);
      this.problemsToggleIcon.classList.add("open");
    }
    this.isLintPanelOpen = !this.isLintPanelOpen;
  }

  gotoLine() {
    openGotoLinePanel(this.view);
  }

  updateProblems(update: ViewUpdate) {
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    forEachDiagnostic(update.state, (d) => {
      if (d.severity === "error") {
        errorCount++;
      }
      if (d.severity === "warning") {
        warningCount++;
      }
      if (d.severity === "info") {
        infoCount++;
      }
    });
    if (errorCount > 0) {
      const separator = warningCount > 0 ? "," : "";
      this.errorsLabel.textContent =
        (errorCount === 1 ? `${errorCount} Error` : `${errorCount} Errors`) +
        separator;
      this.errorsLabel.hidden = false;
    } else {
      this.errorsLabel.hidden = true;
    }
    if (warningCount > 0) {
      const separator = infoCount > 0 ? "," : "";
      this.warningsLabel.textContent =
        (warningCount === 1
          ? `${warningCount} Warning`
          : `${warningCount} Warnings`) + separator;
      this.warningsLabel.hidden = false;
    } else {
      this.warningsLabel.hidden = true;
    }
    if (infoCount > 0) {
      this.infosLabel.textContent =
        infoCount === 1 ? `${infoCount} Info` : `${infoCount} Infos`;
      this.infosLabel.hidden = false;
    } else {
      this.infosLabel.hidden = true;
    }
  }

  updateLineColumn(update: ViewUpdate) {
    const numSelectionRanges = update.state.selection.ranges.length;
    const numCharactersSelected = update.state.selection.ranges
      .map((r) => r.to - r.from)
      .reduce((a, b) => a + b);
    if (numSelectionRanges > 1) {
      const selectionsSummary = `${numSelectionRanges} selections`;
      const charactersSelectedSummary =
        numCharactersSelected > 0
          ? `(${numCharactersSelected} characters selected)`
          : "";
      this.lineColumnLabel.textContent = [
        selectionsSummary,
        charactersSelectedSummary,
      ]
        .join(" ")
        .trim();
    } else if (numSelectionRanges === 1) {
      const cursorPos = update.state.selection.main.from;
      const cursorLine = update.state.doc.lineAt(cursorPos);
      const lineNumber = cursorLine.number;
      const colNumber = cursorPos - cursorLine.from + 1;
      const selectionsSummary = `Ln ${lineNumber}, Col ${colNumber}`;
      const charactersSelectedSummary =
        numCharactersSelected > 0 ? `(${numCharactersSelected} selected)` : "";
      this.lineColumnLabel.textContent = [
        selectionsSummary,
        charactersSelectedSummary,
      ]
        .join(" ")
        .trim();
    } else {
      const selectionsSummary = `Ln 1, Col 1`;
      this.lineColumnLabel.textContent = selectionsSummary;
    }
  }

  update(update: ViewUpdate) {
    this.updateProblems(update);
    this.updateLineColumn(update);
  }
}

const statusPanelTheme = EditorView.baseTheme({
  ".cm-status": {
    height: "28px",
    color: "#516A85",
    backgroundColor: EDITOR_COLORS.panel,
    display: "flex",
    justifyContent: "space-between",
    "& .cm-button": {
      height: "100%",
      border: "none",
      backgroundImage: "none",
      backgroundColor: "transparent",
      whiteSpace: "pre",
      padding: "1px 8px",
      fontSize: "14px",
      textAlign: "center",
      display: "flex",
      alignItems: "center",
      gap: "4px",
    },
    "& .cm-button:hover": {
      backgroundColor: "#FFFFFF0D",
    },
    "& .cm-statusIcon": {
      display: "inline-block",
      width: "16px",
      height: "16px",
      verticalAlign: "middle",
      backgroundColor: "transparent",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
    },
    "& .cm-statusLabel": {
      display: "inline-block",
      verticalAlign: "middle",
    },
    "& .cm-problemsToggleIcon": {
      backgroundImage: `url('data:image/svg+xml,<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="none"  stroke="%23516A85" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6l-6 6"/></svg>')`,
      marginRight: "3px",
    },
    "& .cm-problemsToggleIcon.open": {
      transform: "rotate(90deg)",
    },
  },
});

export const statusPanel = () => [
  showPanel.of((view) => new StatusPanel(view)),
  statusPanelTheme,
];
