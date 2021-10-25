export enum InstructionType {
  DragAndDropFiles = "DragAndDropFiles",
  BrowseFiles = "BrowseFiles",
  SelectToEdit = "SelectToEdit",
  SelectOneToEdit = "SelectOneToEdit",
  SelectOneTypeToEdit = "SelectOneTypeToEdit",
  ClickToAdd = "ClickToAdd",
  ListCountLimitReached = "ListCountLimitReached",
  None = "None",
  Add = "Add",
  To = "To",
  Search = "Search",
  LaunchGame = "LaunchGame",
  CannotEdit = "CannotEdit",
}

export const instructions: { [type in InstructionType]: string } = {
  DragAndDropFiles: "Drag & Drop files here",
  BrowseFiles: "Browse Files",
  SelectToEdit: "Select a <b>{target}</b> to edit",
  SelectOneToEdit:
    "Multi-editing is not supported.<br>Select <b>1 {target}</b> to edit",
  SelectOneTypeToEdit:
    "Multi-editing different types is not supported.<br>Select <b>1 type of {target}</b> to edit",
  ClickToAdd: "Click <b>+</b> to add <b>{target}</b>",
  ListCountLimitReached: "<b>{item}</b> limit reached",
  None: "(No {target})",
  Add: "Add {target}",
  To: "to {target}",
  Search: "Search...",
  LaunchGame: "Launch your game",
  CannotEdit: "Press {button} to stop game and enable editing",
};
