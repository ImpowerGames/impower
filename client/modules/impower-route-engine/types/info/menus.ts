export enum GamePreviewMenuItemType {
  ViewPage = "ViewPage",
  ViewGame = "ViewGame",
  ShowDebugOverlay = "ShowDebugOverlay",
  HideDebugOverlay = "HideDebugOverlay",
  SaveGameState = "SaveGameState",
  LoadGameState = "LoadGameState",
}

export const gamePreviewMenuItems: {
  [type in GamePreviewMenuItemType]: string;
} = {
  ViewGame: "View Game",
  ViewPage: "View Page",
  ShowDebugOverlay: "Show Debug Overlay",
  HideDebugOverlay: "Hide Debug Overlay",
  SaveGameState: "Save Game State",
  LoadGameState: "Load Game State",
};
