import * as vscode from "vscode";

export const getUri = (uri: string) => vscode.Uri.parse(uri);
