import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Tab from "@material-ui/core/Tab";
import Typography from "@material-ui/core/Typography";
import dynamic from "next/dynamic";
import React, {
  CSSProperties,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import ArrowLeftRegularIcon from "../../../../resources/icons/regular/arrow-left.svg";
import CopyRegularIcon from "../../../../resources/icons/regular/copy.svg";
import PasteRegularIcon from "../../../../resources/icons/regular/paste.svg";
import ScissorsRegularIcon from "../../../../resources/icons/regular/scissors.svg";
import SquareRegularIcon from "../../../../resources/icons/regular/square.svg";
import TrashCanRegularIcon from "../../../../resources/icons/regular/trash-can.svg";
import AngleLeftSolidIcon from "../../../../resources/icons/solid/angle-left.svg";
import AngleRightSolidIcon from "../../../../resources/icons/solid/angle-right.svg";
import ExclamationSolidIcon from "../../../../resources/icons/solid/exclamation.svg";
import HammerSolidIcon from "../../../../resources/icons/solid/hammer.svg";
import PlusSolidIcon from "../../../../resources/icons/solid/plus.svg";
import SquareCheckSolidIcon from "../../../../resources/icons/solid/square-check.svg";
import format from "../../../impower-config/utils/format";
import {
  difference,
  getAllVisiblePropertyPaths,
  getFirstError,
  intersection,
  OrderedCollection,
} from "../../../impower-core";
import { useDialogNavigation } from "../../../impower-dialog";
import {
  ContainerData,
  ContainerReference,
  GameProjectData,
  getItemsField,
  InstanceData,
  isContainerReference,
  isItemData,
  isItemReference,
  isScopable,
  ItemData,
  ItemReference,
  ItemSectionType,
  ItemType,
  Reference,
  SetupSectionType,
} from "../../../impower-game/data";
import {
  deepCopyData,
  getAllNestedData,
  ImpowerGameInspector,
} from "../../../impower-game/inspector";
import { ImpowerGameRunner } from "../../../impower-game/runner";
import { DynamicIcon, FontIcon } from "../../../impower-icon";
import { getScrollY, setScrollY } from "../../../impower-react-virtualization";
import {
  AccessibleEvent,
  ButtonShape,
  InputBlocker,
  layout,
  Tabs,
  useArrowShortcuts,
  useClipboardShortcuts,
  useDeleteShortcuts,
  useSelectionShortcuts,
} from "../../../impower-route";
import PeerTransition from "../../../impower-route/components/animations/PeerTransition";
import useBodyBackgroundColor from "../../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../impower-route/hooks/useHTMLBackgroundColor";
import { GameInspectorContext } from "../../contexts/gameInspectorContext";
import { GameRunnerContext } from "../../contexts/gameRunnerContext";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import {
  useContainerNavigation,
  useInspectedContainers,
  useItemNavigation,
} from "../../hooks/dataHooks";
import {
  dataPanelChangeInteraction,
  dataPanelChangeItemSection,
  dataPanelInspect,
  dataPanelMultiInteraction,
  dataPanelOpen,
  dataPanelRemoveInteraction,
  dataPanelSetInteraction,
  dataPanelSetLastAddedTypeId,
  dataPanelSetScrollPosition,
  dataPanelToggleInteraction,
} from "../../types/actions/dataPanelActions";
import {
  projectInsertData,
  projectRemoveData,
  projectUpdateData,
  projectValidateData,
} from "../../types/actions/projectActions";
import { DataButtonInfo } from "../../types/info/buttons";
import { getHeader, HeaderInfo } from "../../types/info/headers";
import { instructions, InstructionType } from "../../types/info/instructions";
import { getSections } from "../../types/info/sections";
import {
  getInsertionIndex,
  getItems,
} from "../../types/selectors/dataPanelSelectors";
import { getContainerType } from "../../types/selectors/windowSelectors";
import {
  DataInteractionType,
  DataPanelType,
  DataWindowType,
  ItemPanelState,
} from "../../types/state/dataPanelState";
import { Mode } from "../../types/state/testState";
import { PanelType } from "../../types/state/windowState";
import ItemButton from "../contentButtons/ItemButton";
import CornerFab from "../fabs/CornerFab";
import PanelHeader from "../headers/PanelHeader";
import PanelHeaderIconButton from "../iconButtons/PanelHeaderIconButton";
import EngineDataList from "../inputs/EngineDataList";
import EditGameTooltipContent from "../instructions/EditGameTooltipContent";
import EmptyPanelContent from "../layouts/EmptyPanelContent";
import Panel from "../layouts/Panel";
import PanelBottomRightOverlay from "../layouts/PanelBottomRightOverlay";

const ContextMenu = dynamic(
  () => import("../../../impower-route/components/popups/ContextMenu"),
  { ssr: false }
);

const getList = async (
  gameInspector: ImpowerGameInspector,
  gameRunner: ImpowerGameRunner,
  inspectedContainerId: string,
  visibleItems: { [id: string]: ItemData },
  itemSectionType: ItemType | ItemSectionType,
  project: GameProjectData,
  errorColor: string
): Promise<OrderedCollection<DataButtonInfo>> => {
  switch (itemSectionType) {
    case "Preview":
      return {
        order: [],
        data: {},
      };
    default: {
      const newOrderedInfo: { [refId: string]: DataButtonInfo } = {};
      const promises = Object.values(visibleItems).map(
        (visibleItem): Promise<{ id: string; error: string | null }> => {
          const instanceInspector = gameInspector.getInspector(
            visibleItem.reference
          );
          const { refId } = visibleItem.reference;
          return getFirstError(
            getAllVisiblePropertyPaths(
              visibleItem,
              instanceInspector.isPropertyVisible,
              instanceInspector.createData
            ),
            visibleItem,
            instanceInspector.getPropertyError,
            () => [
              inspectedContainerId || visibleItem.reference.parentContainerId,
            ]
          ).then((error) => ({ id: refId, error }));
        }
      );
      const errors = await Promise.all(promises);

      Object.values(visibleItems).forEach((visibleItem) => {
        const { refId, refTypeId } = visibleItem.reference;
        const inspector = gameInspector.getInspector(visibleItem.reference);
        const runner = gameRunner.getRunner(visibleItem.reference);
        const typeInfo = inspector.getTypeInfo(visibleItem);
        const name = inspector.getName(visibleItem);
        const formattedSummary = gameInspector.getFormattedSummary(
          inspector.getSummary(visibleItem),
          visibleItem,
          project
        );
        const hasChildren = runner.opensGroup(visibleItem);
        const error = errors.find(({ id }) => id === refId)?.error;
        const newInfo = error
          ? ({
              refId,
              refTypeId,
              name,
              summary: error,
              icon: <ExclamationSolidIcon />,
              iconColor: errorColor,
              textColor: errorColor,
              hasChildren,
            } as DataButtonInfo)
          : ({
              refId,
              refTypeId,
              name,
              summary: formattedSummary,
              icon: <DynamicIcon icon={typeInfo.icon} />,
              iconColor: typeInfo.color,
              hasChildren,
            } as DataButtonInfo);
        newOrderedInfo[refId] = newInfo;
      });
      return {
        order: Object.keys(newOrderedInfo),
        data: newOrderedInfo,
      };
    }
  }
};

const StyledPanelContentArea = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const StyledList = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-top: ${(props): string => props.theme.spacing(2)};
  padding-left: ${(props): string =>
    props.theme.spacing(props.theme.space.panelLeft)};

  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding-left: ${(props): string => props.theme.spacing(3)};
  }
`;

const StyledEmptyPanelContentArea = styled.div`
  flex: 1;
  display: flex;
  padding-bottom: ${(props): string =>
    props.theme.spacing(props.theme.space.panelLeft)};
  padding-right: ${(props): string =>
    props.theme.spacing(props.theme.space.panelLeft)};

  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding-right: ${(props): string => props.theme.spacing(3)};
  }
`;

const StyledTabs = styled(Tabs)`
  pointer-events: auto;
`;

const StyledTab = styled(Tab)`
  padding: ${(props): string => props.theme.spacing(1, 1.5)};
`;

const StyledPaginationArea = styled.div`
  margin-right: -${(props): string => props.theme.spacing(2)};
  position: relative;
  display: flex;
  background-color: ${(props): string => props.theme.colors.darkForeground};
`;

const StyledTypography = styled(Typography)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`;

interface ItemPanelHeaderProps {
  containerHeaderInfo: HeaderInfo;
  bottomChildren?: React.ReactNode;
  style?: CSSProperties;
  scrollParent?: HTMLElement | null;
  inspectedTargetContainerId: string;
  inspectedTargetContainer: ContainerData;
  inspectedContainerIds: string[];
  previousContainerId: string;
  nextContainerId: string;
  onInspectPreviousContainer: () => void;
  onInspectNextContainer: () => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const ItemPanelHeader = React.memo(
  (props: ItemPanelHeaderProps): JSX.Element => {
    const {
      containerHeaderInfo,
      style,
      bottomChildren,
      scrollParent,
      inspectedTargetContainerId,
      inspectedTargetContainer,
      inspectedContainerIds,
      previousContainerId,
      nextContainerId,
      onInspectPreviousContainer,
      onInspectNextContainer,
      onClose,
      onContextMenu,
    } = props;

    const theme = useTheme();

    const selectedContainerName = useMemo(
      () => inspectedTargetContainer?.name || "",
      [inspectedTargetContainer]
    );

    return (
      <PanelHeader
        type="default"
        title={selectedContainerName}
        scrollParent={scrollParent}
        backIcon={<ArrowLeftRegularIcon />}
        backLabel={`Close`}
        moreLabel={`More Options`}
        style={style}
        onBack={onClose}
        onMore={onContextMenu}
        rightChildren={
          <>
            {inspectedTargetContainerId && inspectedContainerIds && (
              <StyledPaginationArea>
                <StyledTypography variant="caption" style={{ opacity: 0.7 }}>
                  {`${
                    inspectedContainerIds.indexOf(inspectedTargetContainerId) +
                    1
                  }/${inspectedContainerIds.length}`}
                </StyledTypography>
                <PanelHeaderIconButton
                  aria-label={`Previous ${containerHeaderInfo.name}`}
                  icon={<AngleLeftSolidIcon />}
                  size={theme.fontSize.smallIcon}
                  style={previousContainerId ? undefined : { opacity: 0.5 }}
                  onClick={onInspectPreviousContainer}
                />
                <PanelHeaderIconButton
                  aria-label={`Next ${containerHeaderInfo.name}`}
                  icon={<AngleRightSolidIcon />}
                  size={theme.fontSize.smallIcon}
                  style={nextContainerId ? undefined : { opacity: 0.5 }}
                  onClick={onInspectNextContainer}
                />
              </StyledPaginationArea>
            )}
          </>
        }
        bottomChildren={bottomChildren}
      />
    );
  }
);

interface ItemPanelContentProps {
  gameInspector: ImpowerGameInspector;
  gameRunner: ImpowerGameRunner;
  section: ItemType | ItemSectionType | SetupSectionType;
  inspectedContainerIds: string[];
  project: GameProjectData;
  itemPanelState: ItemPanelState;
  headerInfo: HeaderInfo;
  items: { [refId: string]: ItemData };
  levels: { [refId: string]: number };
  changeTypeTargetId: string;
  search?: string;
  draggingIds: string[];
  selectedIds: string[];
  scrollParent?: HTMLElement | null;
  onSetDragging: (refIds: string[]) => void;
  onSetOrder: (refIds: string[], reorderedIds: string[]) => void;
  onSetSelection: (refId: string[]) => void;
  onClick?: (refId: string, event: React.MouseEvent) => void;
  onChangeSelection: (refId: string, event: AccessibleEvent) => void;
  onToggleSelection: (refId: string, event: AccessibleEvent) => void;
  onMultiSelection: (
    refId: string,
    allIds: string[],
    event: AccessibleEvent
  ) => void;
  onEdit: (refId: string, event: AccessibleEvent) => void;
  onChangeType: (refId: string, refTypeId: string) => void;
  onContextMenu?: (event: AccessibleEvent) => void;
  onDataAreaRef?: (instance: HTMLDivElement | null) => void;
}

const ItemPanelContent = React.memo(
  (props: ItemPanelContentProps): JSX.Element | null => {
    const {
      gameInspector,
      gameRunner,
      section,
      inspectedContainerIds,
      project,
      itemPanelState,
      headerInfo,
      items,
      levels,
      changeTypeTargetId,
      search,
      draggingIds,
      selectedIds,
      scrollParent,
      onSetDragging,
      onSetOrder,
      onSetSelection,
      onClick,
      onChangeSelection,
      onToggleSelection,
      onMultiSelection,
      onEdit,
      onChangeType,
      onContextMenu,
      onDataAreaRef,
    } = props;

    const [list, setList] = useState<OrderedCollection<DataButtonInfo, string>>(
      { order: [], data: {} }
    );
    const theme = useTheme();

    const addInstruction = useMemo(
      () =>
        format(instructions[InstructionType.None], {
          target: headerInfo.pluralName,
        }),
      [headerInfo]
    );

    const inspectedContainerId = inspectedContainerIds[0];

    useEffect(() => {
      getList(
        gameInspector,
        gameRunner,
        inspectedContainerId,
        items,
        section as ItemType,
        project,
        theme.palette.error.main
      ).then((list) => setList(list));
    }, [
      gameInspector,
      gameRunner,
      inspectedContainerId,
      section,
      items,
      project,
      theme.palette.error.main,
    ]);

    const empty = section !== "Preview" && list.order.length === 0;

    const getSearchTargets = (refId: string): string[] => [
      list.data[refId].name,
      list.data[refId].summary,
    ];

    const Icon = headerInfo.iconOn;

    if (empty) {
      return (
        <>
          <StyledEmptyPanelContentArea
            className={StyledEmptyPanelContentArea.displayName}
          >
            <EmptyPanelContent
              instruction={addInstruction}
              name={headerInfo.name}
              icon={<Icon />}
              onContextMenu={onContextMenu}
            />
          </StyledEmptyPanelContentArea>
        </>
      );
    }

    return (
      <EngineDataList
        list={list}
        levels={levels}
        itemSize={layout.size.minHeight.dataButton + 8}
        draggingIds={draggingIds}
        selectedIds={selectedIds}
        changeTargetId={changeTypeTargetId}
        search={search}
        scrollParent={scrollParent}
        onSetDragging={onSetDragging}
        onSetOrder={onSetOrder}
        onSetSelection={onSetSelection}
        getSearchTargets={getSearchTargets}
        onRef={onDataAreaRef}
        style={{
          paddingBottom: layout.size.minWidth.headerIcon + 16,
        }}
      >
        {({
          id,
          index,
          value,
          currentOrderedIds,
          currentSelectedIds,
          currentFocusedIds,
          currentDraggingIds,
          onDragHandleTrigger,
        }): JSX.Element => {
          const item = items[id];
          return (
            <ItemButton
              buttonShape={ButtonShape.Pill}
              id={id}
              index={index}
              value={value as DataButtonInfo}
              currentOrderedIds={currentOrderedIds}
              currentSelectedIds={currentSelectedIds}
              currentDraggingIds={currentDraggingIds}
              currentGhostingIds={
                currentFocusedIds !== null
                  ? difference(currentOrderedIds, currentFocusedIds)
                  : currentDraggingIds.length > 0
                  ? difference(currentSelectedIds, currentDraggingIds)
                  : []
              }
              changeTypeTargetId={changeTypeTargetId}
              targetContainerId={inspectedContainerId}
              itemPanelState={itemPanelState}
              disabled={
                isScopable(item) &&
                isItemReference(item.reference) &&
                inspectedContainerId !== item.reference.parentContainerId &&
                inspectedContainerId !== item.overrideParentContainerId
              }
              onClick={onClick}
              onChangeSelection={onChangeSelection}
              onToggleSelection={onToggleSelection}
              onMultiSelection={onMultiSelection}
              onOpenContextMenu={onContextMenu}
              onEdit={onEdit}
              onChangeType={onChangeType}
              onDragHandleTrigger={onDragHandleTrigger}
            />
          );
        }}
      </EngineDataList>
    );
  }
);

interface ItemPanelProps {
  windowType: DataWindowType;
  open?: boolean;
}

const ItemPanel = React.memo((props: ItemPanelProps): JSX.Element => {
  const { windowType } = props;

  const [state, dispatch] = useContext(ProjectEngineContext);
  const { gameInspector } = useContext(GameInspectorContext);
  const { gameRunner } = useContext(GameRunnerContext);
  const { portrait } = useContext(WindowTransitionContext);

  const theme = useTheme();

  const [optionsMenuReference, setOptionsMenuReference] = React.useState<
    "anchorEl" | "anchorPosition"
  >("anchorEl");
  const [optionsMenuAnchorEl, setOptionsMenuAnchorEl] =
    React.useState<HTMLElement | null>(null);
  const [optionsMenuPosition, setOptionsMenuPosition] = React.useState<{
    top: number;
    left: number;
  }>();
  const [optionsMenuOpen, setOptionsMenuOpen] = useState<boolean>();
  const [scrollParent, setScrollParent] = useState<HTMLDivElement>();
  const [changeTypeTargetId, setChangeTypeTargetId] = useState<string>("");
  const [wasCut, setWasCut] = useState<boolean>(false);
  const [copiedReferences, setCopiedReferences] = useState<{
    [itemType in ItemType]: Reference[];
  }>({
    Trigger: [],
    Command: [],
    Variable: [],
    Element: [],
  });
  const [copiedData, setCopiedData] = useState<{
    [itemType in ItemType]: { [refId: string]: InstanceData };
  }>({
    Trigger: {},
    Command: {},
    Variable: {},
    Element: {},
  });
  const [sectionIndex, setSectionIndex] = useState(0);
  const [previousSectionIndex, setPreviousSectionIndex] = useState(-1);

  const containerType = useMemo(
    () => getContainerType(windowType),
    [windowType]
  );

  const { mode } = state.present.test;
  const project = state.present.project.data as GameProjectData;
  const openPanel = state.present.dataPanel.panels?.[windowType]?.openPanel;
  const { section } = state.present.dataPanel.panels[windowType].Item;
  const inspectedContainerTargetId =
    state.present.dataPanel.panels[windowType].Item.inspectedTargetId;

  const inspectedContainers = useInspectedContainers(state.present, windowType);
  const inspectedTargetContainer =
    inspectedContainers?.[inspectedContainerTargetId];
  const inspectedContainerIds = useMemo(
    () => Object.values(inspectedContainers).map((d) => d.reference.refId),
    [inspectedContainers]
  );

  const itemPanelState = state.present.dataPanel.panels[windowType].Item;

  const inspectedItems: { [refId: string]: ItemData } = useMemo(
    () =>
      section === "Preview"
        ? {}
        : getItems(inspectedTargetContainer, section as ItemType),
    [inspectedTargetContainer, section]
  );
  const inspectedItemReferences = useMemo(
    () => Object.values(inspectedItems).map((item) => item.reference),
    [inspectedItems]
  );
  const inspectedItemIds = useMemo(
    () => inspectedItemReferences.map((r) => r.refId),
    [inspectedItemReferences]
  );

  const lastAddedItemTypeId =
    section !== "Preview"
      ? state.present.dataPanel.panels[windowType].Item.lastAddedTypeIds[
          section
        ]
      : undefined;
  const draggingItemReferences = useMemo(
    () =>
      section !== "Preview"
        ? state?.present?.dataPanel?.panels?.[windowType]?.Item?.interactions
            ?.Dragging || []
        : undefined,
    [section, state?.present?.dataPanel?.panels, windowType]
  );
  const allSelectedItemReferences = useMemo(
    () =>
      section !== "Preview"
        ? state?.present?.dataPanel?.panels?.[windowType]?.Item?.interactions
            ?.Selected || []
        : undefined,
    [section, state?.present?.dataPanel?.panels, windowType]
  );
  const selectedItemReferences = useMemo(
    () =>
      allSelectedItemReferences
        ? allSelectedItemReferences.filter(
            (r: Reference) => inspectedItems[r.refId] !== undefined
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSelectedItemReferences, JSON.stringify(Object.keys(inspectedItems))]
  );
  const selectedItemIds = useMemo(
    () =>
      selectedItemReferences
        ? selectedItemReferences.map((r: Reference) => r.refId)
        : [],
    [selectedItemReferences]
  );

  const draggingItemIds = useMemo(
    () =>
      draggingItemReferences
        ? draggingItemReferences.map((r: Reference) => r.refId)
        : [],
    [draggingItemReferences]
  );

  const { search } = state.present.dataPanel.panels[windowType].Item;

  const panelKey = `${inspectedTargetContainer}`;
  const scrollPosition =
    state.present.dataPanel.panels[windowType].Item?.scrollPositions?.[
      panelKey
    ];

  const headerInfo = useMemo(() => getHeader(section), [section]);
  const containerHeaderInfo = useMemo(
    () => getHeader(containerType),
    [containerType]
  );

  const levels: { [refId: string]: number } = useMemo(() => {
    return gameRunner.getLevels(Object.values(inspectedItems));
  }, [gameRunner, inspectedItems]);

  const onSelectItem = (reference: ItemReference): void => {
    if (section === "Preview") {
      return;
    }
    dispatch(
      dataPanelSetInteraction(
        windowType,
        DataInteractionType.Selected,
        DataPanelType.Item,
        [reference]
      )
    );
  };
  const handleSetChangeTypeTargetId = useCallback(
    (refId: string) => {
      if (mode === Mode.Test) {
        return;
      }
      setChangeTypeTargetId(refId);
    },
    [mode]
  );
  const handleSetDragging = useCallback(
    (ids: string[]): void => {
      if (section === "Preview") {
        return;
      }
      const references = inspectedItemReferences.filter((r) =>
        ids.includes(r.refId)
      );
      dispatch(
        dataPanelSetInteraction(
          windowType,
          DataInteractionType.Dragging,
          DataPanelType.Item,
          references
        )
      );
    },
    [section, inspectedItemReferences, dispatch, windowType]
  );
  const handleSetOrder = useCallback(
    (ids: string[]): void => {
      if (
        mode === Mode.Test ||
        search ||
        !containerType ||
        section === "Preview"
      ) {
        return;
      }
      dispatch(
        projectUpdateData(
          "Reorder",
          [inspectedTargetContainer.reference],
          `${getItemsField(section as ItemType)}.order`,
          ids
        )
      );
    },
    [
      mode,
      search,
      containerType,
      section,
      dispatch,
      inspectedTargetContainer.reference,
    ]
  );
  const handleAddData = useCallback(() => {
    if (mode === Mode.Test || section === "Preview" || !lastAddedItemTypeId) {
      return;
    }
    const refType = section as ItemType;
    // Don't use specific refTypeId to create data
    // Since we don't know which specific refTypeId the user will choose yet
    const newData = gameInspector.createNewData({
      parentContainerType: containerType,
      parentContainerId: inspectedContainerTargetId,
      refType,
    });
    if (!isItemData(newData)) {
      throw new Error(`Invalid Item Data: ${JSON.stringify(newData)}`);
    }
    newData.reference.refTypeId = lastAddedItemTypeId;
    const inspectedSelectedIds = intersection(
      inspectedItemIds,
      selectedItemIds
    );
    const insertIndex = getInsertionIndex(
      inspectedSelectedIds,
      inspectedItemIds
    );
    dispatch(projectInsertData([newData], "Add", insertIndex));
    dispatch(
      dataPanelSetInteraction(
        windowType,
        DataInteractionType.Selected,
        DataPanelType.Item,
        [newData.reference]
      )
    );
    handleSetChangeTypeTargetId(newData.reference.refId);
  }, [
    mode,
    section,
    lastAddedItemTypeId,
    gameInspector,
    containerType,
    inspectedContainerTargetId,
    inspectedItemIds,
    selectedItemIds,
    dispatch,
    windowType,
    handleSetChangeTypeTargetId,
  ]);

  const handleDeleteData = useCallback(
    (references: Reference[], deleteDescription: string) => {
      if (mode === Mode.Test || section === "Preview") {
        return;
      }
      if (!references || references.length === 0) {
        return;
      }
      const interactableReferences = references.filter(
        (r) => isContainerReference(r) || isItemReference(r)
      ) as (ContainerReference | ItemReference)[];
      if (interactableReferences.length > 0) {
        dispatch(
          dataPanelRemoveInteraction(
            windowType,
            DataInteractionType.Selected,
            DataPanelType.Item,
            interactableReferences
          )
        );
        dispatch(
          dataPanelRemoveInteraction(
            windowType,
            DataInteractionType.Expanded,
            DataPanelType.Item,
            interactableReferences
          )
        );
        dispatch(
          dataPanelRemoveInteraction(
            windowType,
            DataInteractionType.Dragging,
            DataPanelType.Item,
            interactableReferences
          )
        );
      }
      const removableReferences = references.filter(
        (r) => isContainerReference(r) || isItemReference(r)
      ) as (ContainerReference | ItemReference)[];
      dispatch(projectRemoveData(removableReferences, deleteDescription));
    },
    [mode, section, dispatch, windowType]
  );

  const handleRemoveData = useCallback(() => {
    if (mode === Mode.Test) {
      return;
    }
    const inspectedSelectedIds = intersection(
      inspectedItemIds,
      selectedItemIds
    );
    const inspectedSelectedReferences = inspectedItemReferences.filter((r) =>
      inspectedSelectedIds.includes(r.refId)
    );
    handleDeleteData(inspectedSelectedReferences, "Delete");
  }, [
    mode,
    inspectedItemReferences,
    selectedItemIds,
    inspectedItemIds,
    handleDeleteData,
  ]);
  const handleRemoveDataShortcut = useCallback(() => {
    if (openPanel !== DataPanelType.Item || changeTypeTargetId !== "") {
      return;
    }
    handleRemoveData();
  }, [openPanel, changeTypeTargetId, handleRemoveData]);
  const copyData = useCallback(
    (dataWasCut: boolean): Reference[] => {
      setWasCut(dataWasCut);
      const toCopyReferences = selectedItemReferences as Reference[];
      if (toCopyReferences && toCopyReferences.length > 0) {
        const newCopiedReferences = {
          ...copiedReferences,
          [section]: toCopyReferences,
        };
        setCopiedReferences(newCopiedReferences);
        const newCopiedData = {
          ...copiedData,
          [section]: getAllNestedData(toCopyReferences, project),
        };
        setCopiedData(newCopiedData);
      }
      return toCopyReferences;
    },
    [section, project, copiedReferences, copiedData, selectedItemReferences]
  );
  const handleCopyData = useCallback((): Reference[] => {
    if (
      mode === Mode.Test ||
      section === "Preview" ||
      !selectedItemReferences
    ) {
      return [];
    }
    return copyData(false);
  }, [mode, section, selectedItemReferences, copyData]);
  const handleCopyDataShortcut = useCallback(() => {
    if (openPanel !== DataPanelType.Item || changeTypeTargetId !== "") {
      return;
    }
    handleCopyData();
  }, [openPanel, changeTypeTargetId, handleCopyData]);
  const handleCutData = useCallback(() => {
    if (mode === Mode.Test) {
      return;
    }
    const ids = copyData(true);
    handleDeleteData(ids, "Cut");
  }, [mode, copyData, handleDeleteData]);
  const handleCutDataShortcut = useCallback(() => {
    if (openPanel !== DataPanelType.Item || changeTypeTargetId !== "") {
      return;
    }
    handleCutData();
  }, [openPanel, changeTypeTargetId, handleCutData]);
  const handlePasteData = useCallback(async () => {
    if (
      mode === Mode.Test ||
      section === "Preview" ||
      !copiedReferences[section] ||
      copiedReferences[section].length === 0
    ) {
      return;
    }
    const ids = copiedReferences[section].map((r) => r.refId);
    const newDatas: InstanceData[] = await deepCopyData(
      ids,
      {
        parentContainerType: containerType,
        parentContainerId: inspectedContainerTargetId,
      },
      copiedData[section],
      !wasCut
    );

    const inspectedSelectedIds = intersection(
      inspectedItemIds,
      selectedItemIds
    );
    const insertIndex = getInsertionIndex(
      inspectedSelectedIds,
      inspectedItemIds
    );

    dispatch(projectInsertData(newDatas, "Paste", insertIndex));

    const selectedPastedItems = newDatas
      .map((element) => {
        return element.reference;
      })
      .filter((r) => isContainerReference(r) || isItemReference(r)) as (
      | ContainerReference
      | ItemReference
    )[];

    dispatch(
      dataPanelSetInteraction(
        windowType,
        DataInteractionType.Selected,
        DataPanelType.Item,
        selectedPastedItems
      )
    );

    if (wasCut) {
      // Cutting data is treated the same as moving the data,
      // Unlike copying (where new ids are generated for internal references), all ids are preserved during the move,
      // So to avoid duplicate ids, clear the buffer so the user can't paste the data again
      setCopiedData({
        Trigger: {},
        Command: {},
        Variable: {},
        Element: {},
      });
      setCopiedReferences({
        Trigger: [],
        Command: [],
        Variable: [],
        Element: [],
      });
    }
  }, [
    mode,
    section,
    copiedReferences,
    containerType,
    inspectedContainerTargetId,
    copiedData,
    wasCut,
    inspectedItemIds,
    selectedItemIds,
    dispatch,
    windowType,
  ]);

  const handlePasteDataShortcut = useCallback(() => {
    if (openPanel !== DataPanelType.Item || changeTypeTargetId !== "") {
      return;
    }
    handlePasteData();
  }, [openPanel, changeTypeTargetId, handlePasteData]);
  const handleSetSelection = useCallback(
    (ids: string[]): void => {
      if (section === "Preview") {
        return;
      }
      const references = inspectedItemReferences.filter((r) =>
        ids.includes(r.refId)
      );
      dispatch(
        dataPanelSetInteraction(
          windowType,
          DataInteractionType.Selected,
          DataPanelType.Item,
          references
        )
      );
    },
    [section, inspectedItemReferences, dispatch, windowType]
  );
  const handleClick = useCallback(
    (refId: string, e: React.MouseEvent): void => {
      e.stopPropagation();
      dispatch(
        dataPanelSetScrollPosition(windowType, DataPanelType.Item, panelKey, {
          y: getScrollY(scrollParent),
        })
      );
      dispatch(dataPanelInspect(windowType, DataPanelType.Detail, refId));
      dispatch(dataPanelOpen(windowType, DataPanelType.Detail));
    },
    [dispatch, panelKey, scrollParent, windowType]
  );
  const handleChangeSelection = useCallback(
    (refId: string): void => {
      if (section === "Preview") {
        return;
      }
      const reference = inspectedItemReferences.find((r) => r.refId === refId);
      if (reference) {
        dispatch(
          dataPanelChangeInteraction(
            windowType,
            DataInteractionType.Selected,
            DataPanelType.Item,
            reference
          )
        );
      }
    },
    [section, inspectedItemReferences, dispatch, windowType]
  );
  const handleToggleSelection = useCallback(
    (refId: string): void => {
      if (section === "Preview") {
        return;
      }
      const reference = inspectedItemReferences.find((r) => r.refId === refId);
      if (reference) {
        dispatch(
          dataPanelToggleInteraction(
            windowType,
            DataInteractionType.Selected,
            DataPanelType.Item,
            reference
          )
        );
      }
    },
    [section, inspectedItemReferences, dispatch, windowType]
  );
  const handleMultiSelection = useCallback(
    (refId: string, ids: string[]): void => {
      if (section === "Preview") {
        return;
      }
      const reference = inspectedItemReferences.find((r) => r.refId === refId);
      const references = inspectedItemReferences.filter((r) =>
        ids.includes(r.refId)
      );
      if (reference) {
        dispatch(
          dataPanelMultiInteraction(
            windowType,
            DataInteractionType.Selected,
            DataPanelType.Item,
            references,
            reference
          )
        );
      }
    },
    [section, inspectedItemReferences, dispatch, windowType]
  );
  const handleSelectNoneShortcut = useCallback(() => {
    if (openPanel !== DataPanelType.Item || changeTypeTargetId !== "") {
      return;
    }
    handleSetSelection([]);
  }, [openPanel, changeTypeTargetId, handleSetSelection]);
  const handleSelectAllShortcut = useCallback(
    (event: KeyboardEvent) => {
      if (openPanel !== DataPanelType.Item || changeTypeTargetId !== "") {
        return;
      }
      event.preventDefault();
      handleSetSelection(inspectedItemIds);
    },
    [openPanel, changeTypeTargetId, inspectedItemIds, handleSetSelection]
  );
  const { onPreviousItem: selectPreviousItem, onNextItem: selectNextItem } =
    useItemNavigation(selectedItemIds, inspectedItems, onSelectItem);
  const handleSelectPreviousItemShortcut = (e: KeyboardEvent): void => {
    if (openPanel !== DataPanelType.Item) {
      return;
    }
    e.preventDefault();
    selectPreviousItem();
  };
  const handleSelectNextItemShortcut = (e: KeyboardEvent): void => {
    if (openPanel !== DataPanelType.Item) {
      return;
    }
    e.preventDefault();
    selectNextItem();
  };

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);

  useEffect(() => {
    if (inspectedItems && section !== "Preview") {
      if (mode === Mode.Edit) {
        // Validate data before inspecting it
        dispatch(projectValidateData(Object.values(inspectedItems)));
      }
    }
  }, [inspectedItems]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollParent && scrollPosition && scrollPosition?.y !== undefined) {
      window.requestAnimationFrame(() => {
        setScrollY(scrollParent, scrollPosition?.y);
      });
    }
  }, [scrollParent, scrollPosition]);

  const sections = getSections(windowType);

  const handleEdit = useCallback(
    (refId: string, e: AccessibleEvent): void => {
      e.stopPropagation();
      dispatch(dataPanelInspect(windowType, DataPanelType.Detail, refId));
      dispatch(dataPanelOpen(windowType, DataPanelType.Detail));
      const detailPanelElement = document.getElementById(PanelType.Detail);
      if (detailPanelElement) {
        const firstInputElement = detailPanelElement.querySelector("input");
        if (firstInputElement) {
          firstInputElement.focus();
        }
      }
    },
    [dispatch, windowType]
  );
  const handleChangeType = useCallback(
    (refId: string, refTypeId: string): void => {
      if (refTypeId && refId) {
        const item = inspectedItems[refId];
        const newReference = {
          ...item.reference,
          refTypeId,
          refId,
        } as Reference;
        const newData = {
          ...gameInspector
            .getInspector(newReference)
            .createData({ reference: newReference }),
          reference: newReference,
        };
        dispatch(projectInsertData([newData], "Change Type"));
        dispatch(
          dataPanelSetLastAddedTypeId(
            windowType,
            section as ItemType,
            refTypeId
          )
        );
      }
      handleSetChangeTypeTargetId("");
    },
    [
      gameInspector,
      inspectedItems,
      windowType,
      section,
      handleSetChangeTypeTargetId,
      dispatch,
    ]
  );

  const handleSetItemSectionType = useCallback(
    (event: React.ChangeEvent, index: number): void => {
      const sections = getSections(windowType);
      const { type } = sections[index];
      const oldSectionIndex = sections.findIndex((s) => s.type === section);
      setSectionIndex(index);
      setPreviousSectionIndex(oldSectionIndex);
      dispatch(
        dataPanelChangeItemSection(
          windowType,
          type as ItemType | ItemSectionType
        )
      );
    },
    [windowType, dispatch, section]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleSetSelection([]);
      dispatch(
        dataPanelSetScrollPosition(
          windowType,
          DataPanelType.Item,
          panelKey,
          undefined
        )
      );
      dispatch(dataPanelOpen(windowType, DataPanelType.Container));
    },
    [dispatch, handleSetSelection, panelKey, windowType]
  );

  useSelectionShortcuts(handleSelectNoneShortcut, handleSelectAllShortcut);
  useDeleteShortcuts(handleRemoveDataShortcut);
  useClipboardShortcuts(
    handleCutDataShortcut,
    handleCopyDataShortcut,
    handlePasteDataShortcut
  );
  useArrowShortcuts(
    handleSelectPreviousItemShortcut,
    handleSelectNextItemShortcut,
    () => null,
    () => null
  );

  const isAllSelected =
    selectedItemIds !== undefined &&
    selectedItemIds.length > 0 &&
    difference(inspectedItemIds, selectedItemIds).length === 0;

  const canPaste =
    (section !== "Preview" && copiedReferences[section].length > 0) || false;

  const menuOptions = useMemo(
    () => [
      {
        key: isAllSelected ? "Deselect All" : "Select All",
        label: isAllSelected ? "Deselect All" : "Select All",
        icon: isAllSelected ? <SquareCheckSolidIcon /> : <SquareRegularIcon />,
        persistOnClick: true,
        disabled: inspectedItemIds?.length === 0,
      },
      {
        key: "Cut",
        label: "Cut",
        icon: <ScissorsRegularIcon />,
        disabled: selectedItemIds.length === 0,
      },
      {
        key: "Copy",
        label: "Copy",
        icon: <CopyRegularIcon />,
        disabled: selectedItemIds.length === 0,
      },
      {
        key: "Paste",
        label: "Paste",
        icon: <PasteRegularIcon />,
        disabled: !canPaste,
      },
      { key: "---", label: "---" },
      {
        key: "Delete",
        label: "Delete",
        icon: <TrashCanRegularIcon />,
        disabled: selectedItemIds.length === 0,
      },
    ],
    [canPaste, inspectedItemIds?.length, isAllSelected, selectedItemIds?.length]
  );

  const handleScrollRef = useCallback((scrollParent: HTMLDivElement): void => {
    setScrollParent(scrollParent);
  }, []);

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.m !== prevState?.m) {
        setOptionsMenuOpen(currState.m === "context");
      }
    },
    []
  );
  const [openMenuDialog, closeMenuDialog] = useDialogNavigation(
    "m",
    handleBrowserNavigation
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setOptionsMenuReference(e.button === 2 ? "anchorPosition" : "anchorEl");
      setOptionsMenuAnchorEl(e.currentTarget as HTMLElement);
      setOptionsMenuPosition({ left: e.clientX, top: e.clientY });
      setOptionsMenuOpen(true);
      openMenuDialog("context");
    },
    [openMenuDialog]
  );

  const handleCloseOptionsMenu = useCallback(() => {
    setOptionsMenuOpen(false);
    closeMenuDialog();
  }, [closeMenuDialog]);

  const handleClickOption = useCallback(
    (e: React.MouseEvent, option: string) => {
      if (option === "Select All") {
        handleSetSelection(inspectedItemIds);
      }
      if (option === "Deselect All") {
        handleSetSelection([]);
      }
      if (option === "Cut") {
        handleCutData();
      }
      if (option === "Copy") {
        handleCopyData();
      }
      if (option === "Paste") {
        handlePasteData();
      }
      if (option === "Delete") {
        handleRemoveData();
      }
    },
    [
      inspectedItemIds,
      handleCopyData,
      handleCutData,
      handleRemoveData,
      handlePasteData,
      handleSetSelection,
    ]
  );

  const buttonSpacing = theme.spacing(3);
  const fabAreaStyle: CSSProperties = useMemo(
    () => ({
      position: portrait ? "fixed" : "absolute",
      left: buttonSpacing,
      right: buttonSpacing,
      bottom: portrait
        ? layout.size.minHeight.navigationBar + buttonSpacing
        : buttonSpacing,
    }),
    [buttonSpacing, portrait]
  );

  const inspectedTargetIds = useMemo(
    () => [inspectedContainerTargetId],
    [inspectedContainerTargetId]
  );
  const onInspectContainer = useCallback(
    (reference: ContainerReference): void => {
      dispatch(
        dataPanelSetScrollPosition(
          windowType,
          DataPanelType.Item,
          panelKey,
          undefined
        )
      );
      dispatch(
        dataPanelInspect(windowType, DataPanelType.Item, reference.refId)
      );
    },
    [dispatch, panelKey, windowType]
  );
  const {
    previousContainerId,
    nextContainerId,
    onPreviousContainer: inspectPreviousContainer,
    onNextContainer: inspectNextContainer,
  } = useContainerNavigation(
    state.present,
    windowType,
    inspectedTargetIds,
    onInspectContainer
  );

  const fabLabel = `Add ${headerInfo.name}`;

  if (inspectedContainerIds.length === 0) {
    return null;
  }

  return (
    <Panel
      panelType={PanelType.Item}
      onScrollRef={handleScrollRef}
      onContextMenu={handleContextMenu}
      useWindowAsScrollContainer
      topChildren={
        <ItemPanelHeader
          containerHeaderInfo={containerHeaderInfo}
          scrollParent={scrollParent}
          inspectedTargetContainerId={inspectedContainerTargetId}
          inspectedTargetContainer={inspectedTargetContainer}
          inspectedContainerIds={inspectedContainerIds}
          previousContainerId={previousContainerId}
          nextContainerId={nextContainerId}
          onInspectPreviousContainer={inspectPreviousContainer}
          onInspectNextContainer={inspectNextContainer}
          onClose={handleClose}
          onContextMenu={handleContextMenu}
          style={{
            pointerEvents: "auto",
            backgroundColor: theme.colors.darkForeground,
            boxShadow: `0 2px 8px 8px ${theme.colors.darkForeground}`,
          }}
          bottomChildren={
            <StyledTabs
              indicatorColor="secondary"
              value={sections.findIndex((s) => s.type === section)}
              onChange={handleSetItemSectionType}
              style={{ marginLeft: -theme.spacing(1.5) }}
            >
              {sections.map((section, index) => (
                <StyledTab
                  key={section.type}
                  value={index}
                  label={section.name}
                />
              ))}
            </StyledTabs>
          }
        />
      }
      overlay={
        <PanelBottomRightOverlay
          style={{ opacity: mode === Mode.Test ? 0.5 : undefined }}
        >
          <CornerFab
            scrollParent={scrollParent}
            icon={
              <FontIcon aria-label={fabLabel} size={15}>
                {section === "Preview" ? (
                  <HammerSolidIcon />
                ) : (
                  <PlusSolidIcon />
                )}
              </FontIcon>
            }
            label={fabLabel}
            color="secondary"
            shrink={Boolean(search) || search === ""}
            onClick={handleAddData}
            style={fabAreaStyle}
          />
          <InputBlocker
            active={mode === Mode.Test}
            tooltip={<EditGameTooltipContent />}
          />
        </PanelBottomRightOverlay>
      }
    >
      <StyledPanelContentArea className={StyledPanelContentArea.displayName}>
        <PeerTransition
          currentIndex={sectionIndex}
          previousIndex={previousSectionIndex}
          style={{ display: "flex", flexDirection: "column", flex: 1 }}
        >
          <StyledList className={StyledList.displayName}>
            <ItemPanelContent
              gameInspector={gameInspector}
              gameRunner={gameRunner}
              section={section}
              inspectedContainerIds={inspectedContainerIds}
              project={project}
              headerInfo={headerInfo}
              items={inspectedItems}
              levels={levels}
              itemPanelState={itemPanelState}
              changeTypeTargetId={changeTypeTargetId}
              search={search}
              draggingIds={draggingItemIds}
              selectedIds={selectedItemIds}
              scrollParent={scrollParent}
              onSetDragging={handleSetDragging}
              onSetOrder={handleSetOrder}
              onSetSelection={handleSetSelection}
              onClick={handleClick}
              onChangeSelection={handleChangeSelection}
              onToggleSelection={handleToggleSelection}
              onMultiSelection={handleMultiSelection}
              onEdit={handleEdit}
              onChangeType={handleChangeType}
              onContextMenu={handleContextMenu}
            />
          </StyledList>
        </PeerTransition>
      </StyledPanelContentArea>
      {optionsMenuOpen !== undefined && (
        <ContextMenu
          anchorReference={optionsMenuReference}
          anchorEl={optionsMenuAnchorEl}
          anchorPosition={optionsMenuPosition}
          open={optionsMenuOpen}
          options={menuOptions}
          onOption={handleClickOption}
          onClose={handleCloseOptionsMenu}
        />
      )}
    </Panel>
  );
});

export default ItemPanel;
