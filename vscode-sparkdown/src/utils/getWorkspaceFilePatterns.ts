import * as vscode from "vscode";

export const getWorkspaceFilePatterns = (): [
  scriptFiles: string,
  imageFiles: string,
  audioFiles: string,
  videoFiles: string,
  fontFiles: string,
  worldFiles: string,
] => {
  const sparkdownConfig = vscode.workspace.getConfiguration("sparkdown");
  const scriptFiles = sparkdownConfig["scriptFiles"];
  const imageFiles = sparkdownConfig["imageFiles"];
  const audioFiles = sparkdownConfig["audioFiles"];
  const videoFiles = sparkdownConfig["videoFiles"];
  const fontFiles = sparkdownConfig["fontFiles"];
  const worldFiles = sparkdownConfig["worldFiles"];
  const workspaceFilePatterns = [
    scriptFiles,
    imageFiles,
    audioFiles,
    videoFiles,
    fontFiles,
    worldFiles,
  ].map((pattern) => "**/" + pattern) as [
    scriptFiles: string,
    imageFiles: string,
    audioFiles: string,
    videoFiles: string,
    fontFiles: string,
    worldFiles: string,
  ];
  return workspaceFilePatterns;
};
