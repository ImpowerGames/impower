import * as vscode from "vscode";

export interface PreviewPanel {
  uri: string;
  dynamic: boolean;
  panel: vscode.WebviewPanel;
  id: number;
}

interface PreviewState extends Record<string, PreviewPanel[]> {
  game: PreviewPanel[];
  screenplay: PreviewPanel[];
}

export const previewState: PreviewState = {
  game: [],
  screenplay: [],
};
