import {
  ItemType,
  ItemSectionType,
  TriggerTypeId,
  CommandTypeId,
  VariableTypeId,
  ElementTypeId,
  ContainerType,
  SetupSectionType,
  Reference,
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
  scrollId?: string;
  scrollX?: number;
  scrollY?: number;
  search?: string;
  inspectedTargetId?: string;
  inspectedProperties?: string[];
  submitting?: boolean;
  errors?: { [propertyPath: string]: string };
  interactions: {
    [interactionType in DataInteractionType]: (Reference | string)[];
  };
}

export interface ContainerPanelState extends PanelInteractionState {
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
  paneSize: "45%",
  panels: {
    Setup: {
      openPanel: DataPanelType.Setup,
      Container: {
        arrangement: ContainerArrangement.List,
        interactions: {
          Selected: [],
          Dragging: [],
          Expanded: [],
        },
      },
      Item: {
        section: SetupSectionType.Details,
        interactions: {
          Selected: [],
          Dragging: [],
          Expanded: [],
        },
        lastAddedTypeIds: {
          Trigger: TriggerTypeId.EnteredTrigger,
          Command: CommandTypeId.DoCommand,
          Variable: VariableTypeId.StringVariable,
          Element: ElementTypeId.TextElement,
        },
      },
      Detail: {
        interactions: {
          Selected: [],
          Dragging: [],
          Expanded: [],
        },
      },
    },
    Assets: {
      openPanel: DataPanelType.Assets,
      Container: {
        arrangement: ContainerArrangement.List,
        interactions: {
          Selected: [],
          Dragging: [],
          Expanded: [],
        },
      },
      Item: {
        section: ItemType.Command,
        interactions: {
          Selected: [],
          Dragging: [],
          Expanded: [],
        },
        lastAddedTypeIds: {
          Trigger: TriggerTypeId.EnteredTrigger,
          Command: CommandTypeId.DoCommand,
          Variable: VariableTypeId.StringVariable,
          Element: ElementTypeId.TextElement,
        },
      },
      Detail: {
        interactions: {
          Selected: [],
          Dragging: [],
          Expanded: [],
        },
      },
    },
    Entities: {
      openPanel: DataPanelType.Container,
      Container: {
        arrangement: ContainerArrangement.List,
        inspectedTargetId: ContainerType.Construct,
        interactions: {
          Selected: [],
          Dragging: [],
          Expanded: [],
        },
      },
      Item: {
        section: ItemType.Element,
        interactions: {
          Selected: [],
          Dragging: [],
          Expanded: [],
        },
        lastAddedTypeIds: {
          Trigger: TriggerTypeId.EnteredTrigger,
          Command: CommandTypeId.DoCommand,
          Variable: VariableTypeId.StringVariable,
          Element: ElementTypeId.TextElement,
        },
      },
      Detail: {
        interactions: {
          Selected: [],
          Dragging: [],
          Expanded: [],
        },
      },
    },
    Logic: {
      openPanel: DataPanelType.Container,
      Container: {
        arrangement: ContainerArrangement.Chart,
        inspectedTargetId: ContainerType.Block,
        interactions: {
          Selected: [],
          Dragging: [],
          Expanded: [],
        },
      },
      Item: {
        section: ItemType.Command,
        interactions: {
          Selected: [],
          Dragging: [],
          Expanded: [],
        },
        lastAddedTypeIds: {
          Trigger: TriggerTypeId.EnteredTrigger,
          Command: CommandTypeId.DoCommand,
          Variable: VariableTypeId.StringVariable,
          Element: ElementTypeId.TextElement,
        },
      },
      Detail: {
        interactions: {
          Selected: [],
          Dragging: [],
          Expanded: [],
        },
      },
    },
  },
});
