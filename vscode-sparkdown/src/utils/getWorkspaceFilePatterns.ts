import * as vscode from "vscode";

export const getWorkspaceFilePatterns = (): [
  scriptFiles: string,
  imageFiles: string,
  audioFiles: string,
  fontFiles: string
] => {
  const sparkdownConfig = vscode.workspace.getConfiguration("sparkdown");
  const scriptFiles = sparkdownConfig["scriptFiles"];
  const imageFiles = sparkdownConfig["imageFiles"];
  const audioFiles = sparkdownConfig["audioFiles"];
  const fontFiles = sparkdownConfig["fontFiles"];
  const workspaceFilePatterns = [
    scriptFiles,
    imageFiles,
    audioFiles,
    fontFiles,
  ].map((pattern) => "**/" + pattern) as [
    scriptFiles: string,
    imageFiles: string,
    audioFiles: string,
    fontFiles: string
  ];
  return workspaceFilePatterns;
};
