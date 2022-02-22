import {
  ItemSectionType,
  ItemType,
  Reference,
  SetupSectionType,
} from "../../../impower-game/data";

export enum DataWindowType {
  Setup = "Setup",
  Assets = "Assets",
  Entities = "Entities",
  Logic = "Logic",
}

export enum DataPanelType {
  Setup = "Setup",
  Assets = "Assets",
  Container = "Container",
  Item = "Item",
  Detail = "Detail",
}

export enum ContainerArrangement {
  List = "List",
  Chart = "Chart",
}

export enum DataInteractionType {
  Selected = "Selected",
  Expanded = "Expanded",
  Dragging = "Dragging",
}

export interface PanelInteractionState {
  search?: string;
  inspectedTargetId?: string;
  inspectedProperties?: string[];
  submitting?: boolean;
  errors?: { [propertyPath: string]: string };
  scrollPositions?: {
    [id: string]: {
      x?: number;
      y?: number;
    };
  };
  interactions?: {
    [interactionType in DataInteractionType]: (Reference | string)[];
  };
}

export interface ContainerPanelState extends PanelInteractionState {
  scripting: boolean;
  cursor?: {
    anchor: number;
    head: number;
    fromLine: number;
    toLine: number;
  };
  scrollTopLine?: number;
  foldedLines?: number[];
  arrangement: ContainerArrangement;
}

export interface ItemPanelState extends PanelInteractionState {
  section: ItemType | ItemSectionType | SetupSectionType;
  lastAddedTypeIds: {
    [state in ItemType]: string;
  };
}

export interface DataPanelState {
  paneSize: number | string;
  scrollParent?: HTMLElement;
  panels: {
    [containerType in DataWindowType]: {
      openPanel: DataPanelType;
      Container: ContainerPanelState;
      Item: ItemPanelState;
      Detail: PanelInteractionState;
    };
  };
}

export const createDataPanelState = (): DataPanelState => ({
  paneSize: "50%",
  panels: {
    Setup: {
      openPanel: DataPanelType.Setup,
      Container: {
        scripting: false,
        arrangement: ContainerArrangement.List,
      },
      Item: {
        section: "Details",
        lastAddedTypeIds: {
          Trigger: "EnteredTrigger",
          Command: "DoCommand",
          Variable: "StringVariable",
          Element: "TextElement",
        },
      },
      Detail: {},
    },
    Assets: {
      openPanel: DataPanelType.Assets,
      Container: {
        scripting: false,
        arrangement: ContainerArrangement.List,
      },
      Item: {
        section: "Command",
        lastAddedTypeIds: {
          Trigger: "EnteredTrigger",
          Command: "DoCommand",
          Variable: "StringVariable",
          Element: "TextElement",
        },
      },
      Detail: {},
    },
    Entities: {
      openPanel: DataPanelType.Container,
      Container: {
        scripting: false,
        arrangement: ContainerArrangement.List,
        inspectedTargetId: "Construct",
      },
      Item: {
        section: "Element",
        lastAddedTypeIds: {
          Trigger: "EnteredTrigger",
          Command: "DoCommand",
          Variable: "StringVariable",
          Element: "TextElement",
        },
      },
      Detail: {},
    },
    Logic: {
      openPanel: DataPanelType.Container,
      Container: {
        scripting: true,
        arrangement: ContainerArrangement.List,
        inspectedTargetId: "Block",
      },
      Item: {
        section: "Command",
        lastAddedTypeIds: {
          Trigger: "EnteredTrigger",
          Command: "DoCommand",
          Variable: "StringVariable",
          Element: "TextElement",
        },
      },
      Detail: {},
    },
  },
});
