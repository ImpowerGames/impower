import * as vscode from "vscode";

export const getWorkspaceFilePatterns = (): [
  scriptFiles: string,
  imageFiles: string,
  audioFiles: string,
  fontFiles: string,
  worldFiles: string
] => {
  const sparkdownConfig = vscode.workspace.getConfiguration("sparkdown");
  const scriptFiles = sparkdownConfig["scriptFiles"];
  const imageFiles = sparkdownConfig["imageFiles"];
  const audioFiles = sparkdownConfig["audioFiles"];
  const fontFiles = sparkdownConfig["fontFiles"];
  const worldFiles = sparkdownConfig["worldFiles"];
  const workspaceFilePatterns = [
    scriptFiles,
    imageFiles,
    audioFiles,
    fontFiles,
    worldFiles,
  ].map((pattern) => "**/" + pattern) as [
    scriptFiles: string,
    imageFiles: string,
    audioFiles: string,
    fontFiles: string,
    worldFiles: string
  ];
  return workspaceFilePatterns;
};
