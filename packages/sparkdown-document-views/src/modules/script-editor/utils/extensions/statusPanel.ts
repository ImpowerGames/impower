import {
  closeLintPanel,
  Diagnostic,
  forEachDiagnostic,
  linter,
  openLintPanel,
} from "@codemirror/lint";
import {
  EditorState,
  Extension,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Command,
  EditorView,
  Panel,
  PanelConstructor,
  showPanel,
  ViewUpdate,
} from "@codemirror/view";
import {
  closeReferencePanel,
  forEachReference,
  isMobile,
  isReferencePanelOpen,
  ReferenceLocation,
  setReferencePanel,
} from "@impower/codemirror-vscode-lsp-client/src";
import EDITOR_COLORS from "../../constants/EDITOR_COLORS";
import {
  closeCustomGotoLinePanel,
  customGotoLinePanelOpen,
  openCustomGotoLinePanel,
} from "./customSearch";

const CHEVRON_SVG_URL = `url('data:image/svg+xml;utf8,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="black"><path d="M7.97612 10.0719L12.3334 5.7146L12.9521 6.33332L8.28548 11L7.66676 11L3.0001 6.33332L3.61882 5.7146L7.97612 10.0719Z"/></svg>')`;

const REFERENCES_SVG_URL = `url('data:image/svg+xml;utf8,<svg width="24" height="25" viewBox="0 0 24 25" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M1.5 8.81777V5.81777C1.5 4.57677 2.509 3.56777 3.75 3.56777H7.939L6.219 1.84777C5.926 1.55477 5.926 1.07977 6.219 0.786767C6.512 0.493767 6.987 0.493767 7.28 0.786767L10.28 3.78677C10.573 4.07977 10.573 4.55477 10.28 4.84777L7.28 7.84777C7.134 7.99377 6.942 8.06777 6.75 8.06777C6.558 8.06777 6.366 7.99477 6.22 7.84777C5.927 7.55477 5.927 7.07977 6.22 6.78677L7.94 5.06677H3.75C3.337 5.06677 3 5.40277 3 5.81677V8.81677C3 9.23177 2.665 9.56677 2.25 9.56677C1.835 9.56677 1.5 9.23177 1.5 8.81677V8.81777ZM15.75 11.0678H20.25C20.664 11.0678 21 10.7318 21 10.3178C21 9.90377 20.664 9.56777 20.25 9.56777H15.75C15.336 9.56777 15 9.90377 15 10.3178C15 10.7318 15.336 11.0678 15.75 11.0678ZM15.75 5.06777H20.25C20.664 5.06777 21 4.73177 21 4.31777C21 3.90377 20.664 3.56777 20.25 3.56777H15.75C15.336 3.56777 15 3.90377 15 4.31777C15 4.73177 15.336 5.06777 15.75 5.06777ZM22.5 0.567767H13.5C12.672 0.567767 12 1.24077 12 2.06777V9.56777C12.549 9.56777 13.057 9.72677 13.5 9.98477V2.06777H22.501V12.5678H15V14.0678H22.5C23.328 14.0678 24 13.3938 24 12.5678V2.06777C24 1.24077 23.328 0.567767 22.5 0.567767ZM15.75 8.06777H20.25C20.664 8.06777 21 7.73177 21 7.31777C21 6.90377 20.664 6.56777 20.25 6.56777H15.75C15.336 6.56777 15 7.31777 15 7.31777C15 7.73177 15.336 8.06777 15.75 8.06777ZM5.25 15.5678H9.75C10.164 15.5678 10.5 15.2318 10.5 14.8178C10.5 14.4038 10.164 14.0678 9.75 14.0678H5.25C4.836 14.0678 4.5 14.4038 4.5 14.8178C4.5 15.2318 4.836 15.5678 5.25 15.5678ZM5.25 18.5678H9.75C10.164 18.5678 10.5 18.2318 10.5 17.8178C10.5 17.4038 10.164 17.0678 9.75 17.0678H5.25C4.836 17.0678 4.5 17.4038 4.5 17.8178C4.5 18.2318 4.836 18.5678 5.25 18.5678ZM5.25 21.5678H9.75C10.164 21.5678 10.5 21.2318 10.5 20.8178C10.5 20.4038 10.164 20.0678 9.75 20.0678H5.25C4.836 20.0678 4.5 20.4038 4.5 20.8178C4.5 21.2318 4.836 21.5678 5.25 21.5678ZM13.5 12.5678V23.0678C13.5 23.8938 12.828 24.5678 12 24.5678H3C2.172 24.5678 1.5 23.8938 1.5 23.0678V12.5678C1.5 11.7408 2.172 11.0678 3 11.0678H12C12.828 11.0678 13.5 11.7408 13.5 12.5678ZM12.001 12.5678H3V23.0678H12.001V12.5678Z"/></svg>')`;

const NO_PROBLEMS_SVG_URL = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="m7 12.5l3 3l7-7"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2S2 6.477 2 12s4.477 10 10 10"/></g></svg>')`;

const INFO_SVG_URL = `url('data:image/svg+xml;utf8,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M8.49902 7.49998C8.49902 7.22384 8.27517 6.99998 7.99902 6.99998C7.72288 6.99998 7.49902 7.22384 7.49902 7.49998V10.5C7.49902 10.7761 7.72288 11 7.99902 11C8.27517 11 8.49902 10.7761 8.49902 10.5V7.49998ZM8.74807 5.50001C8.74807 5.91369 8.41271 6.24905 7.99903 6.24905C7.58535 6.24905 7.25 5.91369 7.25 5.50001C7.25 5.08633 7.58535 4.75098 7.99903 4.75098C8.41271 4.75098 8.74807 5.08633 8.74807 5.50001ZM8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15C11.866 15 15 11.866 15 8C15 4.13401 11.866 1 8 1ZM2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8Z"/></svg>')`;

const WARNING_SVG_URL = `url('data:image/svg+xml;utf8,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M14.831 11.965L9.206 1.714C8.965 1.274 8.503 1 8 1C7.497 1 7.035 1.274 6.794 1.714L1.169 11.965C1.059 12.167 1 12.395 1 12.625C1 13.383 1.617 14 2.375 14H13.625C14.383 14 15 13.383 15 12.625C15 12.395 14.941 12.167 14.831 11.965ZM13.625 13H2.375C2.168 13 2 12.832 2 12.625C2 12.561 2.016 12.5 2.046 12.445L7.671 2.195C7.736 2.075 7.863 2 8 2C8.137 2 8.264 2.075 8.329 2.195L13.954 12.445C13.984 12.501 14 12.561 14 12.625C14 12.832 13.832 13 13.625 13ZM8.75 11.25C8.75 11.664 8.414 12 8 12C7.586 12 7.25 11.664 7.25 11.25C7.25 10.836 7.586 10.5 8 10.5C8.414 10.5 8.75 10.836 8.75 11.25ZM7.5 9V5.5C7.5 5.224 7.724 5 8 5C8.276 5 8.5 5.224 8.5 5.5V9C8.5 9.276 8.276 9.5 8 9.5C7.724 9.5 7.5 9.276 7.5 9Z"/></svg>')`;

const ERROR_SVG_URL = `url('data:image/svg+xml;utf8,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M8 1C4.14 1 1 4.14 1 8C1 11.86 4.14 15 8 15C11.86 15 15 11.86 15 8C15 4.14 11.86 1 8 1ZM8 14C4.691 14 2 11.309 2 8C2 4.691 4.691 2 8 2C11.309 2 14 4.691 14 8C14 11.309 11.309 14 8 14ZM10.854 5.854L8.708 8L10.854 10.146C11.049 10.341 11.049 10.658 10.854 10.853C10.756 10.951 10.628 10.999 10.5 10.999C10.372 10.999 10.244 10.95 10.146 10.853L8 8.707L5.854 10.853C5.756 10.951 5.628 10.999 5.5 10.999C5.372 10.999 5.244 10.95 5.146 10.853C4.951 10.658 4.951 10.341 5.146 10.146L7.292 8L5.146 5.854C4.951 5.659 4.951 5.342 5.146 5.147C5.341 4.952 5.658 4.952 5.853 5.147L7.999 7.293L10.145 5.147C10.34 4.952 10.657 4.952 10.852 5.147C11.047 5.342 11.047 5.659 10.852 5.854H10.854Z"/></svg>')`;

type StatusPanelState = {
  panel: PanelConstructor;
};

const statusPanelState = StateField.define<StatusPanelState | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (let e of tr.effects) if (e.is(setStatusPanel)) return e.value;
    return value;
  },
  provide: (f) => showPanel.from(f, (val) => (val ? val.panel : null)),
});

export const setStatusPanel = StateEffect.define<StatusPanelState | null>();

export class StatusPanel implements Panel {
  dom: HTMLElement;

  revealBottomPanelButton: HTMLElement;

  revealBottomPanelIcon: HTMLSpanElement;

  errorsLabel: HTMLSpanElement;

  warningsLabel: HTMLSpanElement;

  infosLabel: HTMLSpanElement;

  referencesLabel: HTMLSpanElement;

  gotoLineButton: HTMLButtonElement;

  lineColumnLabel: HTMLSpanElement;

  diagnosticContextContainer: HTMLDivElement;

  diagnosticSummaryContainer: HTMLDivElement;

  activeDiagnosticMessage: HTMLSpanElement;

  nextDiagnosticButton: HTMLButtonElement;

  diagnosticNavigationContainer: HTMLDivElement;

  prevDiagnosticButton: HTMLButtonElement;

  diagnosticCounterLabel: HTMLSpanElement;

  activeDiagnosticIcon: HTMLSpanElement;

  // Track which sub-index is active when multiple diagnostics are at the same location
  private lastActiveIndex: number = -1;

  constructor(readonly view: EditorView) {
    this.dom = document.createElement("div");
    this.dom.className = "cm-toolbar cm-status";

    this.revealBottomPanelButton = this.dom.appendChild(
      document.createElement("button"),
    );
    this.revealBottomPanelButton.className = "cm-button cm-revealBottomPanel";
    this.revealBottomPanelButton.setAttribute("name", "reveal");
    this.revealBottomPanelButton.setAttribute("type", "button");
    this.revealBottomPanelButton.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    this.revealBottomPanelButton.onmousedown = (e) => {
      e.stopPropagation();
    };
    this.revealBottomPanelButton.ontouchstart = (e) => {
      e.stopPropagation();
    };
    this.revealBottomPanelButton.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleBottomPanel();
    };

    this.revealBottomPanelIcon = this.revealBottomPanelButton.appendChild(
      document.createElement("span"),
    );
    this.revealBottomPanelIcon.className =
      "cm-statusIcon cm-problemsToggleIcon";

    this.errorsLabel = this.revealBottomPanelButton.appendChild(
      document.createElement("span"),
    );
    this.errorsLabel.className = "cm-statusLabel cm-errorsLabel";

    this.warningsLabel = this.revealBottomPanelButton.appendChild(
      document.createElement("span"),
    );
    this.warningsLabel.className = "cm-statusLabel cm-warningsLabel";

    this.infosLabel = this.revealBottomPanelButton.appendChild(
      document.createElement("span"),
    );
    this.infosLabel.className = "cm-statusLabel cm-infosLabel";

    this.referencesLabel = this.revealBottomPanelButton.appendChild(
      document.createElement("span"),
    );
    this.referencesLabel.className = "cm-statusLabel cm-referencesLabel";

    this.diagnosticContextContainer = this.dom.appendChild(
      document.createElement("div"),
    );
    this.diagnosticContextContainer.className = "cm-diagnosticContext";
    this.diagnosticContextContainer.style.display = "none";

    this.diagnosticSummaryContainer =
      this.diagnosticContextContainer.appendChild(
        document.createElement("div"),
      );
    this.diagnosticSummaryContainer.className = "cm-diagnosticSummary";

    this.diagnosticNavigationContainer =
      this.diagnosticContextContainer.appendChild(
        document.createElement("div"),
      );
    this.diagnosticNavigationContainer.className = "cm-diagnosticNavigation";

    this.activeDiagnosticIcon = this.diagnosticSummaryContainer.appendChild(
      document.createElement("span"),
    );
    this.activeDiagnosticIcon.className =
      "cm-statusLabel cm-activeDiagnosticIcon";

    this.activeDiagnosticMessage = this.diagnosticSummaryContainer.appendChild(
      document.createElement("span"),
    );
    this.activeDiagnosticMessage.className =
      "cm-statusLabel cm-activeDiagnosticMessage";

    this.prevDiagnosticButton = this.diagnosticNavigationContainer.appendChild(
      document.createElement("button"),
    );
    this.prevDiagnosticButton.className = "cm-button cm-icon-button";
    this.prevDiagnosticButton.onclick = () => this.navigateDiagnostic(-1, true);
    const prevIcon = this.prevDiagnosticButton.appendChild(
      document.createElement("span"),
    );
    prevIcon.className = "cm-statusIcon cm-navLeftIcon";

    this.diagnosticCounterLabel =
      this.diagnosticNavigationContainer.appendChild(
        document.createElement("span"),
      );
    this.diagnosticCounterLabel.className =
      "cm-statusLabel cm-diagnosticCounter";

    this.nextDiagnosticButton = this.diagnosticNavigationContainer.appendChild(
      document.createElement("button"),
    );
    this.nextDiagnosticButton.className = "cm-button cm-icon-button";
    this.nextDiagnosticButton.onclick = () => this.navigateDiagnostic(1, true);
    const nextIcon = this.nextDiagnosticButton.appendChild(
      document.createElement("span"),
    );
    nextIcon.className = "cm-statusIcon cm-navRightIcon";

    this.gotoLineButton = this.dom.appendChild(
      document.createElement("button"),
    );
    this.gotoLineButton.className = "cm-button";
    this.gotoLineButton.name = "problems";
    this.gotoLineButton.type = "button";
    this.gotoLineButton.onclick = () => {
      this.toggleGotoLinePanel(view.state);
    };

    this.lineColumnLabel = this.gotoLineButton.appendChild(
      document.createElement("span"),
    );
    this.lineColumnLabel.className = "cm-statusLabel cm-lineColumnLabel";
  }

  toggleBottomPanel() {
    if (
      this.view.hasFocus ||
      (!isReferencePanelOpen(this.view.state) &&
        !isLintPanelOpen(this.view.state))
    ) {
      openLintPanel(this.view);
    } else {
      closeReferencePanel(this.view);
      this.view.focus();
    }
  }

  toggleGotoLinePanel(state: EditorState) {
    if (customGotoLinePanelOpen(state)) {
      closeCustomGotoLinePanel(this.view);
    } else {
      openCustomGotoLinePanel(this.view);
    }
  }

  private getSortedDiagnostics(): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    forEachDiagnostic(this.view.state, (d) => diagnostics.push(d));
    // Sort primarily by location, then by message to keep duplicates stable
    diagnostics.sort(
      (a, b) =>
        a.from - b.from || a.to - b.to || a.message.localeCompare(b.message),
    );
    return diagnostics;
  }

  navigateDiagnostic(direction: 1 | -1, takeFocus: boolean) {
    const diagnostics = this.getSortedDiagnostics();
    if (diagnostics.length === 0) return;

    const cursorPos = this.view.state.selection.main.head;

    // Check if cursor is already on the diagnostic we last displayed
    const currentMatches = diagnostics.filter(
      (d) => cursorPos >= d.from && cursorPos <= d.to,
    );

    let targetIndex = 0;

    if (currentMatches.length > 0) {
      // Find the absolute index of the current active diagnostic in the full list
      const firstMatchIndex = diagnostics.indexOf(currentMatches[0]!);
      // If we are currently in a "stack", navigate within or past it
      const relativeIndex =
        this.lastActiveIndex !== -1 ? this.lastActiveIndex : firstMatchIndex;
      targetIndex =
        (relativeIndex + direction + diagnostics.length) % diagnostics.length;
    } else {
      // Not on a diagnostic, find nearest
      if (direction === 1) {
        targetIndex = diagnostics.findIndex((d) => d.from > cursorPos);
        if (targetIndex === -1) targetIndex = 0;
      } else {
        for (let i = diagnostics.length - 1; i >= 0; i--) {
          if (diagnostics[i]!.to < cursorPos) {
            targetIndex = i;
            break;
          }
        }
        if (targetIndex === -1) targetIndex = diagnostics.length - 1;
      }
    }

    const target = diagnostics[targetIndex]!;
    this.lastActiveIndex = targetIndex; // Update tracker

    if (takeFocus) this.view.focus();
    this.view.dispatch({
      selection: { anchor: target.from, head: target.to },
      effects: EditorView.scrollIntoView(target.from, { y: "center" }),
    });
  }

  updateStatus(update: ViewUpdate) {
    const isContextualView = isMobile() && update.view.hasFocus;

    if (isReferencePanelOpen(update.state)) {
      this.revealBottomPanelButton.style.display = "";
      this.diagnosticContextContainer.style.display = "none";

      let referenceCount = 0;
      const files = new Set<string>();
      forEachReference(update.state, (ref: ReferenceLocation) => {
        files.add(ref.file.uri);
        referenceCount++;
      });
      const fileCount = files.size;
      this.referencesLabel.textContent = update.state.phrase(
        referenceCount === 1 && fileCount === 1
          ? `$1 reference in $2 file`
          : referenceCount !== 1 && fileCount !== 1
            ? `$1 references in $2 files`
            : referenceCount === 1 && fileCount !== 1
              ? `$1 reference in $2 files`
              : referenceCount !== 1 && fileCount === 1
                ? `$1 references in $2 file`
                : "",
        referenceCount,
        fileCount,
      );
      this.referencesLabel.hidden = false;
      this.errorsLabel.hidden = true;
      this.warningsLabel.hidden = true;
      this.infosLabel.hidden = true;
    } else {
      this.referencesLabel.hidden = true;

      let errorCount = 0;
      let warningCount = 0;
      let infoCount = 0;
      const diagnostics = this.getSortedDiagnostics();

      diagnostics.forEach((d) => {
        if (d.severity === "error") errorCount++;
        else if (d.severity === "warning") warningCount++;
        else if (d.severity === "info") infoCount++;
      });

      const cursorPos = update.state.selection.main.head;

      const matches = diagnostics.filter(
        (d) => cursorPos >= d.from && cursorPos <= d.to,
      );

      let activeDiagnostic: Diagnostic | undefined;
      let activeIdx = -1;

      if (matches.length > 0) {
        activeIdx =
          this.lastActiveIndex !== -1 &&
          matches.includes(diagnostics[this.lastActiveIndex]!)
            ? this.lastActiveIndex
            : diagnostics.indexOf(matches[0]!);

        activeDiagnostic = diagnostics[activeIdx];
        this.lastActiveIndex = activeIdx;
      } else {
        this.lastActiveIndex = -1;
      }

      if (isContextualView && activeDiagnostic) {
        this.revealBottomPanelButton.style.display = "none";
        this.gotoLineButton.style.display = "none";
        this.diagnosticContextContainer.style.display = "flex";
        this.activeDiagnosticMessage.textContent =
          activeDiagnostic.message.split("\n")[0]!;
        const severity = activeDiagnostic.severity || "info";
        const activeDiagnosticIconImage =
          severity === "error"
            ? ERROR_SVG_URL
            : severity === "warning"
              ? WARNING_SVG_URL
              : INFO_SVG_URL;
        this.activeDiagnosticIcon.style.maskImage = activeDiagnosticIconImage;
        this.activeDiagnosticIcon.style.webkitMaskImage =
          activeDiagnosticIconImage;
        this.diagnosticContextContainer.classList.toggle("error", false);
        this.diagnosticContextContainer.classList.toggle("warning", false);
        this.diagnosticContextContainer.classList.toggle("info", false);
        this.diagnosticContextContainer.classList.toggle(severity, true);

        const hasMultipleTotal = diagnostics.length > 1;
        this.diagnosticCounterLabel.textContent = `${activeIdx + 1}/${diagnostics.length}`;

        this.prevDiagnosticButton.style.display = hasMultipleTotal
          ? "flex"
          : "none";
        this.nextDiagnosticButton.style.display = hasMultipleTotal
          ? "flex"
          : "none";
        this.diagnosticCounterLabel.style.display = hasMultipleTotal
          ? "inline-block"
          : "none";
      } else {
        this.revealBottomPanelButton.style.display = "";
        this.gotoLineButton.style.display = "";
        this.diagnosticContextContainer.style.display = "none";
      }

      if (errorCount > 0) {
        const separator = warningCount > 0 ? update.state.phrase(",") : "";
        this.errorsLabel.textContent =
          update.state.phrase(
            errorCount === 1 ? `$1 Error` : `$1 Errors`,
            errorCount,
          ) + separator;
        this.errorsLabel.hidden = false;
      } else {
        this.errorsLabel.hidden = true;
      }
      if (warningCount > 0) {
        const separator = infoCount > 0 ? update.state.phrase(",") : "";
        this.warningsLabel.textContent =
          update.state.phrase(
            warningCount === 1 ? `$1 Warning` : `$1 Warnings`,
            warningCount,
          ) + separator;
        this.warningsLabel.hidden = false;
      } else {
        this.warningsLabel.hidden = true;
      }
      if (infoCount > 0) {
        this.infosLabel.textContent = update.state.phrase(
          infoCount === 1 ? `$1 Info` : `$1 Infos`,
          infoCount,
        );
        this.infosLabel.hidden = false;
      } else {
        this.infosLabel.hidden = true;
      }
    }
  }

  updateLineColumn(update: ViewUpdate) {
    const numSelectionRanges = update.state.selection.ranges.length;
    const numCharactersSelected = update.state.selection.ranges
      .map((r) => r.to - r.from)
      .reduce((a, b) => a + b);
    if (numSelectionRanges > 1) {
      const selectionsSummary = update.state.phrase(
        `$1 selections`,
        numSelectionRanges,
      );
      const charactersSelectedSummary =
        numCharactersSelected > 0
          ? update.state.phrase(
              `($1 characters selected)`,
              numCharactersSelected,
            )
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
      const selectionsSummary = update.state.phrase(
        `Ln $1, Col $2`,
        lineNumber,
        colNumber,
      );
      const charactersSelectedSummary =
        numCharactersSelected > 0
          ? update.state.phrase(`($1 selected)`, numCharactersSelected)
          : "";
      this.lineColumnLabel.textContent = [
        selectionsSummary,
        charactersSelectedSummary,
      ]
        .join(" ")
        .trim();
    } else {
      const selectionsSummary = update.state.phrase(`Ln $1, Col $2`, 1, 1);
      this.lineColumnLabel.textContent = selectionsSummary;
    }
  }

  update(update: ViewUpdate) {
    this.updateStatus(update);
    this.updateLineColumn(update);
  }
}

const statusPanelTheme = EditorView.baseTheme({
  "&.keyboard-open .cm-panels-bottom > :not(.cm-toolbar), & .cm-panels-bottom > :not(.cm-toolbar):not(:focus-within)":
    {
      position: "fixed",
      opacity: "0",
      top: "-10000px",
    },

  ".cm-status": {
    height: "28px",
    color: EDITOR_COLORS.statusLabel,
    backgroundColor: EDITOR_COLORS.panel,
    display: "flex",
    justifyContent: "space-between",
    "& .cm-diagnosticContext": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      overflow: "hidden",
      flex: 1,
      "&.error": {
        color: "#f14c4c",
      },
      "&.warning": {
        color: "#cca700",
      },
      "&.info": {
        color: "#59a4f9",
      },
    },
    "& .cm-button": {
      height: "100%",
      border: "none",
      backgroundImage: "none",
      whiteSpace: "pre",
      padding: "1px 8px",
      fontSize: "14px",
      textAlign: "center",
      display: "flex",
      alignItems: "center",
      gap: "4px",
      position: "relative",
    },
    "& .cm-problemsLabel": {
      height: "100%",
      border: "none",
      backgroundImage: "none",
      whiteSpace: "pre",
      padding: "1px 8px",
      fontSize: "14px",
      textAlign: "center",
      display: "flex",
      alignItems: "center",
      gap: "4px",
      position: "relative",
    },
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
    marginRight: "3px",
    backgroundColor: "currentColor",
    maskImage: CHEVRON_SVG_URL,
    webkitMaskImage: CHEVRON_SVG_URL,
    maskRepeat: "no-repeat",
    webkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    webkitMaskPosition: "center",
    transform: "rotate(-90deg)",
  },
  "& .cm-diagnosticCounter": {
    fontSize: "12px",
    fontWeight: "bold",
    padding: "0 4px",
    whiteSpace: "nowrap",
  },
  "& .cm-diagnosticSummary": {
    height: "100%",
    whiteSpace: "pre",
    padding: "1px 8px",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    position: "relative",
  },
  "& .cm-diagnosticNavigation": {
    display: "flex",
  },
  "& .cm-activeDiagnosticMessage": {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flex: 1,
    fontSize: "13px",
  },
  "& .cm-activeDiagnosticIcon": {
    width: "16px",
    height: "16px",
    marginRight: "3px",
    backgroundColor: "currentColor",
    maskRepeat: "no-repeat",
    webkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    webkitMaskPosition: "center",
  },
  "& .cm-navLeftIcon": {
    backgroundColor: "currentColor",
    maskImage: CHEVRON_SVG_URL,
    webkitMaskImage: CHEVRON_SVG_URL,
    maskRepeat: "no-repeat",
    webkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    webkitMaskPosition: "center",
    transform: "rotate(90deg)",
  },
  "& .cm-navRightIcon": {
    backgroundColor: "currentColor",
    maskImage: CHEVRON_SVG_URL,
    webkitMaskImage: CHEVRON_SVG_URL,
    maskRepeat: "no-repeat",
    webkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    webkitMaskPosition: "center",
    transform: "rotate(-90deg)",
  },
  "&:not(.keyboard-open) .cm-panels-bottom:has(> :not(.cm-toolbar):focus-within) .cm-problemsToggleIcon":
    {
      transform: "rotate(0)",
    },
  "& .cm-icon-button": {
    padding: "1px 4px",
    minWidth: "24px",
    justifyContent: "center",
  },
  "&:not(.keyboard-open) .cm-panels-bottom:has(> :not(.cm-toolbar):focus-within) .cm-revealBottomPanel":
    {
      color: "#cccccc",
    },

  "& .cm-button:active::after": {
    content: "''",
    position: "absolute",
    inset: "0",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  "@media (hover: hover) and (pointer: fine)": {
    ".cm-button:hover::after": {
      content: "''",
      position: "absolute",
      inset: "0",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
    },
  },
});

export function isLintPanelOpen(state: EditorState) {
  const lintState = (
    (linter(() => []) as Extension[]).at(-1) as Extension[]
  )[0] as StateField<{ panel?: Panel }>;
  return state.field(lintState, false)?.panel != null;
}

function createStatusPanel(view: EditorView) {
  return new StatusPanel(view);
}

export const openStatusPanel: Command = (view) => {
  let data: StatusPanelState = { panel: createStatusPanel };
  let effect =
    view.state.field(statusPanelState, false) === undefined
      ? StateEffect.appendConfig.of(statusPanelState.init(() => data))
      : setStatusPanel.of(data);
  view.dispatch({ effects: effect });
  return true;
};

export function isStatusPanelOpen(state: EditorState) {
  return Boolean(state.field(statusPanelState, false));
}

export const closeStatusPanel: Command = (view) => {
  if (!view.state.field(statusPanelState, false)) return false;
  view.dispatch({ effects: setReferencePanel.of(null) });
  return true;
};

export const statusPanel = () => {
  return [
    showPanel.of(createStatusPanel),
    statusPanelTheme,
    EditorView.updateListener.of((update) => {
      if (isReferencePanelOpen(update.state)) {
        closeLintPanel(update.view);
      }
    }),
  ];
};
