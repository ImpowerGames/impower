export enum EngineConsoleType {
  Studios = "Studios",
  Projects = "Projects",
  Files = "Files",
  Members = "Members",
  Settings = "Settings",
  UserProfile = "UserProfile",
}

interface EngineConsoleInfo {
  type: EngineConsoleType;
  tab?: string;
  name: string;
  searchLabel?: string;
  createLabel?: string;
  addLabel?: string;
  contextLabel?: string;
  moveLabel?: string;
  editMultipleLabel?: string;
  skipLabel?: string;
  backLabel?: string;
  doneLabel?: string;
  clearLabel?: string;
  noneLabel?: string;
  sortLabel?: string;
  filterLabel?: string;
  finishCreationLabel?: string;
  finishEditLabel?: string;
  nextLabel?: string;
  selectedLabel?: string;
  urlLabel?: string;
  addingMessage?: string;
  createTitle?: string;
  editTitle?: string;
  copyLabel?: string;
  selectAllLabel?: string;
  deselectAllLabel?: string;
}

export const userProfileConsoles: EngineConsoleInfo[] = [
  {
    type: EngineConsoleType.UserProfile,
    name: "UserProfiles",
    createLabel: "Create a user profile",
    addLabel: "Create User Profile",
    skipLabel: "Skip",
    backLabel: "Back",
    nextLabel: "Next",
    finishCreationLabel: "Save User Profile",
    finishEditLabel: "Save Changes",
    urlLabel: "Open Public Page",
    addingMessage: "Creating User Profile...",
    createTitle: "Create User Profile",
  },
];

export const engineConsoles: EngineConsoleInfo[] = [
  {
    type: EngineConsoleType.Studios,
    name: "Studios",
    createLabel: "Create a studio",
    addLabel: "Create Studio",
    skipLabel: "Skip",
    backLabel: "Back",
    nextLabel: "Next",
    finishCreationLabel: "Create Studio",
    finishEditLabel: "Save Changes",
    urlLabel: "Open Public Page",
    addingMessage: "Creating Studio...",
    createTitle: "Create A New Studio",
  },
];

export const studioConsoles: EngineConsoleInfo[] = [
  {
    type: EngineConsoleType.Projects,
    name: "Projects",
    tab: "projects",
    createLabel: "Create Project",
    addLabel: "Create Project",
    selectedLabel: "{count} Selected",
    editMultipleLabel: "Manage",
    contextLabel: "Manage Access",
    skipLabel: "Skip",
    backLabel: "Back",
    nextLabel: "Next",
    doneLabel: "Done",
    noneLabel: "(No Projects)",
    finishCreationLabel: "Create Project",
    finishEditLabel: "Save Changes",
    searchLabel: "Search...",
    clearLabel: "Clear",
    sortLabel: "Sort By",
    filterLabel: "Filter By",
    urlLabel: "Open Public Page",
    addingMessage: "Creating Project...",
    createTitle: "Create a Project",
    editTitle: "Edit Project",
  },
  {
    type: EngineConsoleType.Members,
    name: "Members",
    tab: "members",
    searchLabel: "Search...",
    createLabel: "Edit Member",
    addLabel: "Add Members",
    contextLabel: "Remove",
    editMultipleLabel: "Edit List",
    skipLabel: "Skip",
    backLabel: "Back",
    nextLabel: "Next",
    doneLabel: "Done",
    clearLabel: "Clear",
    noneLabel: "(No Members)",
    sortLabel: "Sort By",
    filterLabel: "Filter By",
    finishCreationLabel: "Add Member",
    finishEditLabel: "Save Changes",
    selectedLabel: "{count} Selected",
    urlLabel: "Open Public Page",
    addingMessage: "Adding Member...",
    createTitle: "Add a Member",
    editTitle: "Edit Member",
  },
  {
    type: EngineConsoleType.Settings,
    name: "Settings",
    tab: "settings",
  },
];

export const projectConsoles: EngineConsoleInfo[] = [
  {
    type: EngineConsoleType.Files,
    name: "Assets",
    tab: "files",
    createLabel: "Upload Files",
    addLabel: "Upload Files",
    contextLabel: "Delete",
    moveLabel: "Move",
    editMultipleLabel: "Edit List",
    skipLabel: "Skip",
    backLabel: "Back",
    nextLabel: "Next",
    doneLabel: "Done",
    noneLabel: "(No Files)",
    searchLabel: "Search...",
    clearLabel: "Clear",
    sortLabel: "Sort By",
    filterLabel: "Filter By",
    finishCreationLabel: "Save File Details",
    finishEditLabel: "Save Changes",
    selectedLabel: "{count} Selected",
    urlLabel: "Open Public Page",
    addingMessage: "Uploading File...",
    createTitle: "Editing File Details",
    copyLabel: "Copy File Url",
    editTitle: "Edit Resource",
    selectAllLabel: "Select All",
    deselectAllLabel: "Deselect All",
  },
  {
    type: EngineConsoleType.Members,
    name: "Members",
    tab: "members",
    searchLabel: "Search...",
    createLabel: "Edit Member",
    addLabel: "Add Members",
    contextLabel: "Remove",
    editMultipleLabel: "Edit List",
    skipLabel: "Skip",
    backLabel: "Back",
    nextLabel: "Next",
    doneLabel: "Done",
    clearLabel: "Clear",
    noneLabel: "(No Members)",
    sortLabel: "Sort By",
    filterLabel: "Filter By",
    finishCreationLabel: "Add Member",
    finishEditLabel: "Save Changes",
    selectedLabel: "{count} Selected",
    urlLabel: "Open Public Page",
    addingMessage: "Adding Member...",
    createTitle: "Add a Member",
    editTitle: "Edit Member",
  },
  {
    type: EngineConsoleType.Settings,
    name: "Settings",
    tab: "settings",
  },
];
