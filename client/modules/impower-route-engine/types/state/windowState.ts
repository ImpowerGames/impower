export enum WindowType {
  Setup = "Setup",
  Assets = "Assets",
  Entities = "Entities",
  Logic = "Logic",
  Test = "Test",
}

export enum PanelType {
  Setup = "Setup",
  Container = "Container",
  Item = "Item",
  Detail = "Detail",
  Test = "Test",
  Assets = "Assets",
}

export interface WindowState {
  type: WindowType;
}

export const createWindowState = (): WindowState => ({
  type: WindowType.Setup,
});
