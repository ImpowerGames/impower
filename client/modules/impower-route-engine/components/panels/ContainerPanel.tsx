import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import React, {
  CSSProperties,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AngleLeftRegularIcon from "../../../../resources/icons/regular/angle-left.svg";
import CopyRegularIcon from "../../../../resources/icons/regular/copy.svg";
import PasteRegularIcon from "../../../../resources/icons/regular/paste.svg";
import PencilRegularIcon from "../../../../resources/icons/regular/pencil.svg";
import ScissorsRegularIcon from "../../../../resources/icons/regular/scissors.svg";
import SquareRegularIcon from "../../../../resources/icons/regular/square.svg";
import TrashCanRegularIcon from "../../../../resources/icons/regular/trash-can.svg";
import CrosshairsSolidIcon from "../../../../resources/icons/solid/crosshairs.svg";
import ExclamationSolidIcon from "../../../../resources/icons/solid/exclamation.svg";
import PlusSolidIcon from "../../../../resources/icons/solid/plus.svg";
import SitemapSolidIcon from "../../../../resources/icons/solid/sitemap.svg";
import SquareCheckSolidIcon from "../../../../resources/icons/solid/square-check.svg";
import TableListSolidIcon from "../../../../resources/icons/solid/table-list.svg";
import format from "../../../impower-config/utils/format";
import {
  difference,
  getAllVisiblePropertyPaths,
  getFirstError,
  OrderedCollection,
} from "../../../impower-core";
import { useDialogNavigation } from "../../../impower-dialog";
import {
  BlockData,
  ContainerData,
  ContainerReference,
  ContainerType,
  defaultNodePosition,
  defaultNodeSize,
  GameProjectData,
  InstanceData,
  isBlockData,
  isContainerData,
  isContainerReference,
  isItemReference,
  isPositionable,
  ItemReference,
  Reference,
} from "../../../impower-game/data";
import {
  deepCopyData,
  getAllNestedData,
  ImpowerGameInspector,
} from "../../../impower-game/inspector";
import { DynamicIcon, FontIcon } from "../../../impower-icon";
import {
  getCenteredPosition,
  getSnappedVector,
  OnPanCanvas,
  OnZoomCanvas,
  Vector2,
} from "../../../impower-react-flowchart";
import {
  getScrollX,
  getScrollY,
  setScrollX,
  setScrollY,
} from "../../../impower-react-virtualization";
import {
  AccessibleEvent,
  ButtonShape,
  InputBlocker,
  layout,
  useArrowShortcuts,
  useClipboardShortcuts,
  useDeleteShortcuts,
  useRenameShortcuts,
  useSelectionShortcuts,
} from "../../../impower-route";
import PeerTransition from "../../../impower-route/components/animations/PeerTransition";
import useBodyBackgroundColor from "../../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../impower-route/hooks/useHTMLBackgroundColor";
import { DataContext } from "../../contexts/dataContext";
import { GameInspectorContext } from "../../contexts/gameInspectorContext";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import {
  useContainerNavigation,
  useInspectedContainers,
} from "../../hooks/dataHooks";
import {
  dataPanelChangeInteraction,
  dataPanelInspect,
  dataPanelMultiInteraction,
  dataPanelOpen,
  dataPanelRemoveInteraction,
  dataPanelSearch,
  dataPanelSetInteraction,
  dataPanelSetParentContainerArrangement,
  dataPanelSetScrollX,
  dataPanelSetScrollY,
  dataPanelToggleInteraction,
} from "../../types/actions/dataPanelActions";
import {
  projectInsertData,
  projectRemoveData,
  projectUpdateData,
} from "../../types/actions/projectActions";
import { DataButtonInfo } from "../../types/info/buttons";
import {
  chartGridSize,
  chartSize,
  getContainerChart,
} from "../../types/info/charts";
import { getHeader, HeaderInfo } from "../../types/info/headers";
import { instructions, InstructionType } from "../../types/info/instructions";
import {
  getInsertionIndex,
  getPositions,
} from "../../types/selectors/dataPanelSelectors";
import { projectContainersSelector } from "../../types/selectors/projectSelectors";
import { getContainerType } from "../../types/selectors/windowSelectors";
import {
  ContainerArrangement,
  ContainerPanelState,
  DataInteractionType,
  DataPanelType,
  DataWindowType,
} from "../../types/state/dataPanelState";
import { Mode } from "../../types/state/testState";
import { PanelType } from "../../types/state/windowState";
import ContainerButton from "../contentButtons/ContainerButton";
import CornerFab from "../fabs/CornerFab";
import PanelHeader from "../headers/PanelHeader";
import PanelHeaderIconButton from "../iconButtons/PanelHeaderIconButton";
import EngineDataList from "../inputs/EngineDataList";
import EditGameTooltipContent from "../instructions/EditGameTooltipContent";
import DataChart from "../layouts/DataChart";
import EmptyPanelContent from "../layouts/EmptyPanelContent";
import Panel from "../layouts/Panel";
import PanelBottomLeftOverlay from "../layouts/PanelBottomLeftOverlay";
import PanelBottomRightOverlay from "../layouts/PanelBottomRightOverlay";
import { BreadcrumbInfo } from "../layouts/PanelBreadcrumbs";

const ContextMenu = dynamic(
  () => import("../../../impower-route/components/popups/ContextMenu"),
  { ssr: false }
);

const nodeStartOffset = { x: -80, y: -16 };
const nodeNextOffset = { x: 0, y: 80 };

const getHeaderBreadcrumbsInternal = (
  container: ContainerData,
  containers: { [refId: string]: ContainerData },
  breadcrumbs: BreadcrumbInfo[]
): void => {
  if (!container || !containers) {
    return;
  }
  breadcrumbs.unshift({
    id: container.reference.refId,
    name: container.name,
    interactable: true,
    separator: "/",
  });

  const parentContainer = containers[container.reference.parentContainerId];
  getHeaderBreadcrumbsInternal(parentContainer, containers, breadcrumbs);
};

const getHeaderBreadcrumbs = (
  container: ContainerData,
  containers: { [refId: string]: ContainerData }
): BreadcrumbInfo[] => {
  const breadcrumbs: BreadcrumbInfo[] = [];
  if (!container || !containers) {
    return breadcrumbs;
  }
  breadcrumbs.unshift({
    id: container.reference.refId,
    name: container.name,
    interactable: false,
    separator: "/",
  });
  const parentContainer = containers[container.reference.parentContainerId];
  getHeaderBreadcrumbsInternal(parentContainer, containers, breadcrumbs);
  return breadcrumbs;
};

const getParentContainer = (
  parentContainerId: string,
  containers: { [refId: string]: ContainerData }
): ContainerData => {
  return containers[parentContainerId];
};

const isRoot = (
  parentContainer: ContainerData,
  containers: { [refId: string]: ContainerData }
): boolean => {
  return (
    !parentContainer ||
    !parentContainer ||
    parentContainer.reference.parentContainerId === "" ||
    !containers[parentContainer.reference.parentContainerId]
  );
};

const getList = async (
  inspector: ImpowerGameInspector,
  childContainers: { [refId: string]: ContainerData },
  project: GameProjectData,
  errorColor: string
): Promise<OrderedCollection<DataButtonInfo>> => {
  const newOrderedInfo: { [refId: string]: DataButtonInfo } = {};
  const promises = Object.values(childContainers).map(
    (childContainer): Promise<{ id: string; error: string | null }> => {
      const instanceInspector = inspector.getInspector(
        childContainer.reference
      );
      const { refId } = childContainer.reference;
      return getFirstError(
        getAllVisiblePropertyPaths(
          childContainer,
          instanceInspector.isPropertyVisible,
          instanceInspector.createData
        ),
        childContainer,
        instanceInspector.getPropertyError,
        () => [childContainer.reference.refId]
      ).then((error) => ({ id: refId, error }));
    }
  );
  const errors = await Promise.all(promises);

  Object.values(childContainers).forEach((childContainer) => {
    const { refId, refTypeId } = childContainer.reference;
    const instanceInspector = inspector.getInspector(childContainer.reference);
    const typeInfo = instanceInspector.getTypeInfo(childContainer);
    const name = instanceInspector.getName(childContainer);
    const formattedSummary = inspector.getFormattedSummary(
      instanceInspector.getSummary(childContainer),
      childContainer,
      project
    );
    const error = errors.find(({ id }) => id === refId)?.error;
    const hasChildren = childContainer.childContainerIds.length > 0;
    const newInfo: DataButtonInfo = error
      ? {
          refId,
          refTypeId,
          name,
          summary: error,
          icon: <ExclamationSolidIcon />,
          iconColor: errorColor,
          textColor: errorColor,
          hasChildren,
        }
      : {
          refId,
          refTypeId,
          name,
          summary: formattedSummary,
          icon: <DynamicIcon icon={typeInfo.icon} />,
          iconColor: typeInfo.color,
          hasChildren,
        };
    newOrderedInfo[refId] = newInfo;
  });
  return {
    order: Object.keys(newOrderedInfo),
    data: newOrderedInfo,
  };
};

const StyledChart = styled.div`
  width: 100%;
  height: 100%;
`;

const StyledList = styled.div`
  padding-top: ${(props): string => props.theme.spacing(2)};
  padding-left: ${(props): string =>
    props.theme.spacing(props.theme.space.panelLeft)};
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledEmptyPanelContentArea = styled.div`
  padding-right: ${(props): string =>
    props.theme.spacing(props.theme.space.panelLeft)};
  padding-bottom: ${(props): string =>
    props.theme.spacing(props.theme.space.panelLeft)};
  height: 100%;
  display: flex;
  flex: 1;
  flex-direction: column;
`;

const StyledChartEmptyPanelContentArea = styled(StyledEmptyPanelContentArea)`
  padding: ${(props): string =>
    props.theme.spacing(props.theme.space.panelLeft)};
  padding-top: ${(props): string => props.theme.spacing(2)};
`;

interface ArrangementPanelHeaderIconProps {
  containerArrangement: ContainerArrangement;
  onClick: (showList: boolean) => void;
}

const ArrangementPanelHeaderIcon = React.memo(
  (props: ArrangementPanelHeaderIconProps): JSX.Element => {
    const { containerArrangement, onClick } = props;
    const theme = useTheme();
    switch (containerArrangement) {
      case ContainerArrangement.List:
        return (
          <PanelHeaderIconButton
            aria-label="View as Chart"
            icon={<SitemapSolidIcon />}
            size={theme.fontSize.smallIcon}
            style={{ backgroundColor: theme.colors.darkForeground }}
            onClick={(): void => onClick(false)}
          />
        );
      default:
        return (
          <PanelHeaderIconButton
            aria-label="View as List"
            icon={<TableListSolidIcon />}
            size={theme.fontSize.smallIcon}
            style={{ backgroundColor: theme.colors.darkForeground }}
            onClick={(): void => onClick(true)}
          />
        );
    }
  }
);

interface ContainerPanelHeaderProps {
  containerType: ContainerType;
  containerPanelState: ContainerPanelState;
  search?: string;
  parentContainer: ContainerData;
  projectContainers: { [refId: string]: ContainerData };
  headerBreadcrumbs: BreadcrumbInfo[];
  style?: CSSProperties;
  scrollParent?: HTMLElement | null;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onArrangement: (showList: boolean) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onSearch: (value: string) => void;
  onBack?: (e: React.MouseEvent) => void;
  onBreadcrumb: (
    e: React.MouseEvent | React.ChangeEvent,
    refId: string
  ) => void;
}

const ContainerPanelHeader = React.memo(
  (props: ContainerPanelHeaderProps): JSX.Element => {
    const {
      containerType,
      containerPanelState,
      search,
      parentContainer,
      projectContainers,
      headerBreadcrumbs,
      style,
      scrollParent,
      onOpenSearch,
      onCloseSearch,
      onArrangement,
      onContextMenu,
      onSearch,
      onBack,
      onBreadcrumb,
    } = props;

    const theme = useTheme();

    const searching = Boolean(search) || search === "";

    const root = useMemo(
      () => isRoot(parentContainer, projectContainers),
      [parentContainer, projectContainers]
    );

    const headerInfo = useMemo(() => getHeader(containerType), [containerType]);

    const listHeaderStyle: CSSProperties = useMemo(
      () => ({
        pointerEvents: "auto",
        backgroundColor: theme.colors.darkForeground,
        boxShadow: `0 2px 8px 8px ${theme.colors.darkForeground}`,
        ...style,
      }),
      [style, theme.colors.darkForeground]
    );

    const chartHeaderStyle: CSSProperties = useMemo(
      () => ({
        pointerEvents: "none",
        zIndex: 2,
        backgroundColor: searching ? theme.colors.darkForeground : undefined,
        ...style,
      }),
      [searching, style, theme.colors.darkForeground]
    );

    const headerStyle =
      containerPanelState.arrangement === ContainerArrangement.Chart
        ? chartHeaderStyle
        : listHeaderStyle;

    const headerStickyStyle = useMemo(
      () => ({
        boxShadow:
          containerPanelState.arrangement === ContainerArrangement.Chart
            ? theme.shadows[0]
            : theme.shadows[3],
      }),
      [containerPanelState.arrangement, theme.shadows]
    );

    return (
      <PanelHeader
        type={search !== undefined ? "search" : "default"}
        title={headerInfo.pluralName}
        search={search}
        breadcrumbs={headerBreadcrumbs}
        breadcrumbIndicatorColor="secondary"
        style={headerStyle}
        stickyStyle={headerStickyStyle}
        scrollParent={scrollParent}
        backIcon={<AngleLeftRegularIcon />}
        backLabel={`Back`}
        moreLabel={`More Options`}
        searchLabel={`Search...`}
        onBack={!root ? onBack : undefined}
        onBreadcrumb={onBreadcrumb}
        onMore={onContextMenu}
        onOpenSearch={onOpenSearch}
        onCloseSearch={onCloseSearch}
        onSearch={onSearch}
        rightChildren={
          containerType === ContainerType.Block && (
            <>
              <ArrangementPanelHeaderIcon
                containerArrangement={containerPanelState.arrangement}
                onClick={onArrangement}
              />
            </>
          )
        }
      />
    );
  }
);

interface ContainerPanelContentProps {
  inspector: ImpowerGameInspector;
  parentContainer: ContainerData;
  project: GameProjectData;
  containerPanelState: ContainerPanelState;
  headerInfo: HeaderInfo;
  childContainers: { [refId: string]: ContainerData };
  changeNameTargetId: string;
  search?: string;
  draggingIds: string[];
  selectedIds: string[];
  breadcrumbIndex?: number;
  previousBreadcrumbIndex?: number;
  scrollParent?: HTMLElement | null;
  onBreadcrumb: (
    e: React.MouseEvent | React.ChangeEvent,
    refId: string
  ) => void;
  onSetDragging: (refIds: string[]) => void;
  onSetOrder: (refIds: string[], reorderedIds: string[]) => void;
  onSetSelection: (refIds: string[]) => void;
  onClick?: (refId: string, event: React.MouseEvent) => void;
  onChangeSelection: (refId: string, event: AccessibleEvent) => void;
  onToggleSelection: (refId: string, event: AccessibleEvent) => void;
  onMultiSelection: (
    refId: string,
    allIds: string[],
    event: AccessibleEvent
  ) => void;
  onSetNodePositions: (positions: { [refId: string]: Vector2 }) => void;
  onDataAreaRef?: (instance: HTMLDivElement | null) => void;
  onPanCanvas: OnPanCanvas;
  onZoomCanvas: OnZoomCanvas;
  onEdit: (refId: string, event: AccessibleEvent) => void;
  onChangeName: (refId: string, renamed: string) => void;
  onContextMenu?: (event: AccessibleEvent) => void;
}

const ContainerPanelContent = React.memo(
  (props: ContainerPanelContentProps): JSX.Element => {
    const {
      inspector,
      parentContainer,
      project,
      containerPanelState,
      headerInfo,
      childContainers,
      changeNameTargetId,
      search,
      draggingIds,
      selectedIds,
      breadcrumbIndex,
      previousBreadcrumbIndex,
      scrollParent,
      onBreadcrumb,
      onSetDragging,
      onSetOrder,
      onSetSelection,
      onClick,
      onChangeSelection,
      onToggleSelection,
      onMultiSelection,
      onSetNodePositions,
      onDataAreaRef,
      onPanCanvas,
      onZoomCanvas,
      onEdit,
      onChangeName,
      onContextMenu,
    } = props;

    const [list, setList] = useState<OrderedCollection<DataButtonInfo, string>>(
      {
        order: [],
        data: {},
      }
    );
    const theme = useTheme();

    useEffect(() => {
      getList(
        inspector,
        childContainers,
        project,
        theme.palette.error.light
      ).then((list) => setList(list));
    }, [childContainers, inspector, project, theme.palette.error.light]);

    const addInstruction = useMemo(
      () =>
        format(instructions[InstructionType.None], {
          target: headerInfo.pluralName,
        }),
      [headerInfo]
    );

    const chart = useMemo(() => {
      return getContainerChart(inspector, childContainers);
    }, [inspector, childContainers]);

    const parentContainerId = parentContainer.reference.refId;
    const buttonShape = ButtonShape.Square;

    const getSearchTargets = (refId: string): string[] => [
      list.data[refId].name,
      list.data[refId].summary,
    ];

    switch (containerPanelState.arrangement) {
      case ContainerArrangement.Chart:
        return (
          <PeerTransition
            currentIndex={breadcrumbIndex}
            previousIndex={previousBreadcrumbIndex}
            style={{ display: "flex", flex: 1 }}
          >
            <StyledChart className={StyledChart.displayName}>
              <DataChart
                infos={list.data}
                draggingIds={draggingIds}
                selectedIds={selectedIds}
                changeTargetId={changeNameTargetId}
                chart={chart}
                shape={buttonShape}
                search={search}
                scrollParent={scrollParent}
                onSetDragging={onSetDragging}
                onSetSelection={onSetSelection}
                onPanCanvas={onPanCanvas}
                onZoomCanvas={onZoomCanvas}
                onSetNodePositions={onSetNodePositions}
                onRef={onDataAreaRef}
              >
                {({
                  id,
                  value,
                  currentOrderedIds,
                  currentSelectedIds,
                  currentFocusedIds,
                  currentDraggingIds,
                  onDragHandleTrigger,
                }): JSX.Element => {
                  return (
                    <ContainerButton
                      buttonShape={buttonShape}
                      id={id}
                      value={value as DataButtonInfo}
                      currentOrderedIds={currentOrderedIds}
                      currentSelectedIds={currentSelectedIds}
                      currentDraggingIds={currentDraggingIds}
                      currentGhostingIds={
                        currentFocusedIds !== null
                          ? difference(currentOrderedIds, currentFocusedIds)
                          : []
                      }
                      changeNameTargetId={changeNameTargetId}
                      onBreadcrumb={onBreadcrumb}
                      onClick={onClick}
                      onChangeSelection={onChangeSelection}
                      onToggleSelection={onToggleSelection}
                      onMultiSelection={onMultiSelection}
                      onOpenContextMenu={onContextMenu}
                      onEdit={onEdit}
                      onChangeName={onChangeName}
                      onDragHandleTrigger={onDragHandleTrigger}
                    />
                  );
                }}
              </DataChart>
            </StyledChart>
          </PeerTransition>
        );
      default:
        return (
          <PeerTransition
            key={parentContainerId}
            currentIndex={breadcrumbIndex}
            previousIndex={previousBreadcrumbIndex}
            style={{ display: "flex", flex: 1 }}
          >
            <StyledList className={StyledList.displayName}>
              {list.order.length === 0 && (
                <>
                  <StyledEmptyPanelContentArea
                    className={StyledEmptyPanelContentArea.displayName}
                  >
                    <EmptyPanelContent
                      instruction={addInstruction}
                      name={headerInfo.name}
                      icon={headerInfo.iconOn}
                      onContextMenu={onContextMenu}
                    />
                  </StyledEmptyPanelContentArea>
                </>
              )}
              {list.order.length > 0 && (
                <EngineDataList
                  list={list}
                  itemSize={layout.size.minHeight.dataButton + 8}
                  draggingIds={draggingIds}
                  selectedIds={selectedIds}
                  changeTargetId={changeNameTargetId}
                  search={search}
                  style={{
                    paddingBottom: layout.size.minWidth.headerIcon + 16,
                  }}
                  scrollParent={scrollParent}
                  onSetDragging={onSetDragging}
                  onSetOrder={onSetOrder}
                  onSetSelection={onSetSelection}
                  getSearchTargets={getSearchTargets}
                  onRef={onDataAreaRef}
                >
                  {({
                    id,
                    value,
                    currentOrderedIds,
                    currentSelectedIds,
                    currentFocusedIds,
                    currentDraggingIds,
                    onDragHandleTrigger,
                  }): JSX.Element => (
                    <ContainerButton
                      buttonShape={buttonShape}
                      id={id}
                      value={value as DataButtonInfo}
                      currentOrderedIds={currentOrderedIds}
                      currentSelectedIds={currentSelectedIds}
                      currentDraggingIds={currentDraggingIds}
                      currentGhostingIds={
                        currentFocusedIds
                          ? difference(currentOrderedIds, currentFocusedIds)
                          : currentDraggingIds.length > 0
                          ? difference(currentSelectedIds, currentDraggingIds)
                          : []
                      }
                      changeNameTargetId={changeNameTargetId}
                      onBreadcrumb={onBreadcrumb}
                      onClick={onClick}
                      onChangeSelection={onChangeSelection}
                      onToggleSelection={onToggleSelection}
                      onMultiSelection={onMultiSelection}
                      onOpenContextMenu={onContextMenu}
                      onEdit={onEdit}
                      onChangeName={onChangeName}
                      onDragHandleTrigger={onDragHandleTrigger}
                      grow
                    />
                  )}
                </EngineDataList>
              )}
            </StyledList>
          </PeerTransition>
        );
    }
  }
);

interface ContainerPanelProps {
  windowType: DataWindowType;
}

const ContainerPanel = React.memo((props: ContainerPanelProps): JSX.Element => {
  const { windowType } = props;

  const [state, dispatch] = useContext(ProjectEngineContext);
  const { gameInspector } = useContext(GameInspectorContext);
  const { portrait } = useContext(WindowTransitionContext);
  const { events } = useContext(DataContext);

  const initialRender = useRef(true);

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
  const [dataAreaElement, setDataAreaElement] = useState<HTMLDivElement>();
  const [changeNameTargetId, setChangeNameTargetId] = useState<string>("");
  const [wasCut, setWasCut] = useState<boolean>(false);
  const [copiedReferences, setCopiedReferences] = useState<{
    [containerType in ContainerType]: Reference[];
  }>({ Construct: [], Block: [] });
  const [copiedData, setCopiedData] = useState<{
    [containerType in ContainerType]: { [refId: string]: InstanceData };
  }>({ Construct: {}, Block: {} });
  const [currentScale, setCurrentScale] = useState<number>(1);
  const [breadcrumbIndex, setBreadcrumbIndex] = useState(0);
  const [previousBreadcrumbIndex, setBreadcrumbPreviousIndex] = useState(-1);

  const containerType = useMemo(
    () => getContainerType(windowType),
    [windowType]
  );

  const { mode } = state.present.test;
  const project = state.present.project.data as GameProjectData;
  const projectContainers = projectContainersSelector(project, containerType);

  const openPanel = state.present.dataPanel.panels?.[windowType]?.openPanel;
  const parentContainerId =
    state.present.dataPanel.panels[windowType].Container.inspectedTargetId;
  const containerPanelState =
    state.present.dataPanel.panels[windowType].Container;
  const { scrollX, scrollY, scrollId } =
    state.present.dataPanel.panels[windowType].Container;

  const inspectedContainers = useInspectedContainers(state.present, windowType);

  const panelKey = `${containerPanelState.arrangement}-${parentContainerId}`;

  const draggingContainerReferences =
    state.present.dataPanel.panels[windowType].Container.interactions.Dragging;
  const allSelectedContainerReferences =
    state.present.dataPanel.panels[windowType].Container.interactions.Selected;
  const selectedContainerReferences = useMemo(
    () =>
      allSelectedContainerReferences
        ? allSelectedContainerReferences.filter(
            (r: Reference) => inspectedContainers[r.refId] !== undefined
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      allSelectedContainerReferences,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      JSON.stringify(Object.keys(inspectedContainers)),
    ]
  );
  const { search } = state.present.dataPanel.panels[windowType].Container;

  const inspectedContainerReferences = useMemo(
    () =>
      Object.values(inspectedContainers).map(
        (container) => container.reference
      ),
    [inspectedContainers]
  );
  const inspectedContainerIds = useMemo(
    () => inspectedContainerReferences.map((r: Reference) => r.refId),
    [inspectedContainerReferences]
  );
  const draggingContainerIds = useMemo(
    () => draggingContainerReferences.map((r: Reference) => r.refId),
    [draggingContainerReferences]
  );
  const selectedContainerIds = useMemo(
    () => selectedContainerReferences.map((r: Reference) => r.refId),
    [selectedContainerReferences]
  );
  const chartNodePositions = useMemo(
    () => getPositions(inspectedContainers),
    [inspectedContainers]
  );
  const parentContainer = useMemo(
    () => getParentContainer(parentContainerId, projectContainers),
    [parentContainerId, projectContainers]
  );
  const headerInfo = useMemo(() => getHeader(containerType), [containerType]);
  const headerBreadcrumbs = useMemo(
    () => getHeaderBreadcrumbs(parentContainer, projectContainers),
    [parentContainer, projectContainers]
  );

  const theme = useTheme();

  const handleGenerateNewDataPosition = useCallback(
    (oldPosition?: Vector2): Vector2 => {
      let newNodePosition = defaultNodePosition;
      if (oldPosition) {
        newNodePosition = oldPosition;
      } else if (scrollParent && dataAreaElement) {
        const { centeredChartPosition } = getCenteredPosition(
          scrollParent,
          dataAreaElement,
          currentScale
        );
        newNodePosition = {
          x: Math.min(
            chartSize.x - defaultNodeSize.x * 2,
            centeredChartPosition.x + nodeStartOffset.x
          ),
          y: Math.min(
            chartSize.y - defaultNodeSize.y * 2,
            centeredChartPosition.y + nodeStartOffset.y
          ),
        };
      }
      const position = {
        x: Math.min(
          chartSize.x - defaultNodeSize.x * 2,
          (newNodePosition?.x || defaultNodePosition.x) + nodeNextOffset.x
        ),
        y: Math.min(
          chartSize.y - defaultNodeSize.y * 2,
          (newNodePosition?.y || defaultNodePosition.y) + nodeNextOffset.y
        ),
      };
      return getSnappedVector(position, chartGridSize);
    },
    [scrollParent, dataAreaElement, currentScale]
  );
  const handleSetChangeNameTargetId = useCallback(
    (refId: string) => {
      if (mode === Mode.Test) {
        return;
      }
      setChangeNameTargetId(refId);
    },
    [mode]
  );
  const handleClickHeaderBackIcon = useCallback(() => {
    dispatch(
      dataPanelInspect(
        windowType,
        DataPanelType.Container,
        parentContainer.reference.parentContainerId
      )
    );
    setBreadcrumbIndex(
      headerBreadcrumbs.findIndex(
        (x) => x.id === parentContainer.reference.parentContainerId
      )
    );
    setBreadcrumbPreviousIndex(
      headerBreadcrumbs.findIndex((x) => x.id === parentContainerId)
    );
  }, [
    dispatch,
    windowType,
    parentContainer.reference.parentContainerId,
    headerBreadcrumbs,
    parentContainerId,
  ]);
  const handleClickHeaderBreadcrumb = useCallback(
    (e: React.ChangeEvent, refId: string) => {
      setBreadcrumbIndex(headerBreadcrumbs.findIndex((x) => x.id === refId));
      setBreadcrumbPreviousIndex(
        headerBreadcrumbs.findIndex((x) => x.id === parentContainerId)
      );
      dispatch(dataPanelInspect(windowType, DataPanelType.Container, refId));
    },
    [headerBreadcrumbs, dispatch, windowType, parentContainerId]
  );
  const handleSetDragging = useCallback(
    (ids: string[]): void => {
      const references = inspectedContainerReferences.filter((r) =>
        ids.includes(r.refId)
      );
      dispatch(
        dataPanelSetInteraction(
          windowType,
          DataInteractionType.Dragging,
          DataPanelType.Container,
          references
        )
      );
    },
    [inspectedContainerReferences, dispatch, windowType]
  );
  const handleSetOrder = useCallback(
    (ids: string[], reorderedIds: string[]): void => {
      if (mode === Mode.Test) {
        return;
      }
      if (!containerType || reorderedIds.length === 0) {
        return;
      }
      dispatch(
        projectUpdateData(
          "Reorder",
          [parentContainer.reference],
          "childContainerIds",
          ids
        )
      );
    },
    [mode, containerType, parentContainer, dispatch]
  );
  const handleAddData = useCallback(() => {
    if (mode === Mode.Test) {
      return;
    }
    const newData = gameInspector.createNewData({
      parentContainerType: containerType,
      parentContainerId,
      refType: containerType,
      refTypeId: containerType,
    });
    if (!isContainerData(newData)) {
      throw new Error(`Invalid Container Data: ${JSON.stringify(newData)}`);
    }
    if (isPositionable(newData)) {
      const lastSelectedId =
        selectedContainerIds[selectedContainerIds.length - 1];
      const lastSelectedPosition = lastSelectedId
        ? chartNodePositions[lastSelectedId]
        : undefined;
      newData.nodePosition =
        handleGenerateNewDataPosition(lastSelectedPosition);
    }
    const insertIndex = getInsertionIndex(
      selectedContainerIds,
      inspectedContainerIds
    );
    dispatch(projectInsertData([newData], "Add", insertIndex));
    dispatch(
      dataPanelSetInteraction(
        windowType,
        DataInteractionType.Selected,
        DataPanelType.Container,
        [newData.reference]
      )
    );
    handleSetChangeNameTargetId(newData.reference.refId);
  }, [
    mode,
    gameInspector,
    containerType,
    parentContainerId,
    selectedContainerIds,
    inspectedContainerIds,
    dispatch,
    windowType,
    handleSetChangeNameTargetId,
    chartNodePositions,
    handleGenerateNewDataPosition,
  ]);

  const handleDeleteData = useCallback(
    (references: Reference[], deleteDescription: string) => {
      if (mode === Mode.Test) {
        return;
      }
      if (!references || references.length === 0) {
        return;
      }
      const interactableReferences = references.filter((r) =>
        isContainerReference(r)
      ) as ContainerReference[];
      if (interactableReferences.length > 0) {
        dispatch(
          dataPanelRemoveInteraction(
            windowType,
            DataInteractionType.Selected,
            DataPanelType.Container,
            interactableReferences
          )
        );
        dispatch(
          dataPanelRemoveInteraction(
            windowType,
            DataInteractionType.Expanded,
            DataPanelType.Container,
            interactableReferences
          )
        );
        dispatch(
          dataPanelRemoveInteraction(
            windowType,
            DataInteractionType.Dragging,
            DataPanelType.Container,
            interactableReferences
          )
        );
      }
      const removableReferences = references.filter(
        (r) => isContainerReference(r) || isItemReference(r)
      ) as (ContainerReference | ItemReference)[];
      dispatch(projectRemoveData(removableReferences, deleteDescription));
    },
    [mode, dispatch, windowType]
  );

  const handleRemoveData = useCallback(() => {
    if (mode === Mode.Test) {
      return;
    }
    handleDeleteData(selectedContainerReferences as Reference[], "Delete");
  }, [mode, selectedContainerReferences, handleDeleteData]);

  const handleRemoveDataShortcut = useCallback(() => {
    if (openPanel !== DataPanelType.Container || changeNameTargetId !== "") {
      return;
    }
    handleRemoveData();
  }, [openPanel, changeNameTargetId, handleRemoveData]);
  const copyData = useCallback(
    (dataWasCut: boolean): Reference[] => {
      setWasCut(dataWasCut);
      const toCopyReferences = selectedContainerReferences as Reference[];
      if (toCopyReferences && toCopyReferences.length > 0) {
        const newCopiedReferences = {
          ...copiedReferences,
          [containerType]: toCopyReferences,
        };
        setCopiedReferences(newCopiedReferences);
        const newCopiedData = {
          ...copiedData,
          [containerType]: getAllNestedData(toCopyReferences, project),
        };
        setCopiedData(newCopiedData);
      }
      return toCopyReferences;
    },
    [
      selectedContainerReferences,
      project,
      containerType,
      copiedReferences,
      copiedData,
    ]
  );
  const handleCopyData = useCallback((): Reference[] => {
    if (mode === Mode.Test) {
      return [];
    }
    return copyData(false);
  }, [mode, copyData]);
  const handleCopyDataShortcut = useCallback(() => {
    if (openPanel !== DataPanelType.Container || changeNameTargetId !== "") {
      return;
    }
    handleCopyData();
  }, [openPanel, changeNameTargetId, handleCopyData]);
  const handleCutData = useCallback(() => {
    if (mode === Mode.Test) {
      return;
    }
    handleDeleteData(copyData(true), "Cut");
  }, [mode, copyData, handleDeleteData]);
  const handleCutDataShortcut = useCallback(() => {
    if (openPanel !== DataPanelType.Container || changeNameTargetId !== "") {
      return;
    }
    handleCutData();
  }, [openPanel, changeNameTargetId, handleCutData]);

  const handlePasteData = useCallback(async () => {
    if (mode === Mode.Test) {
      return;
    }
    if (copiedReferences && copiedReferences[containerType].length > 0) {
      const ids = copiedReferences[containerType].map((r) => r.refId);
      const insertIndex = getInsertionIndex(ids, inspectedContainerIds);

      const newDatas = await deepCopyData(
        ids,
        {
          parentContainerType: containerType,
          parentContainerId,
        },
        copiedData[containerType],
        !wasCut
      );

      // Select all the new items pasted at this level
      const newSelectedDatas = newDatas.filter(
        (d) =>
          isContainerData(d) &&
          d.reference.parentContainerId === parentContainerId
      );
      const newSelectedReferences = newSelectedDatas.map((d) => d.reference);
      const lastSelectedId =
        selectedContainerIds[selectedContainerIds.length - 1];
      let lastPosition = lastSelectedId
        ? chartNodePositions[lastSelectedId]
        : undefined;
      newSelectedDatas.forEach((d) => {
        if (isPositionable(d)) {
          d.nodePosition = handleGenerateNewDataPosition(lastPosition);
          lastPosition = d.nodePosition;
        }
      });

      dispatch(projectInsertData(newDatas, "Paste", insertIndex));
      const interactableReferences = newSelectedReferences.filter(
        (r) => isContainerReference(r) || isItemReference(r)
      ) as (ContainerReference | ItemReference)[];
      dispatch(
        dataPanelSetInteraction(
          windowType,
          DataInteractionType.Selected,
          DataPanelType.Container,
          interactableReferences
        )
      );

      if (wasCut) {
        // Cutting data is treated the same as moving the data,
        // Unlike copying (where new ids are generated for internal references), all ids are preserved during the move,
        // So to avoid duplicate ids, clear the buffer so the user can't paste the data again
        setCopiedData({ Construct: {}, Block: {} });
        setCopiedReferences({ Construct: [], Block: [] });
      }
    }
  }, [
    mode,
    copiedReferences,
    containerType,
    inspectedContainerIds,
    parentContainerId,
    copiedData,
    wasCut,
    selectedContainerIds,
    chartNodePositions,
    dispatch,
    windowType,
    handleGenerateNewDataPosition,
  ]);
  const handlePasteDataShortcut = useCallback(() => {
    if (openPanel !== DataPanelType.Container || changeNameTargetId !== "") {
      return;
    }
    handlePasteData();
  }, [openPanel, changeNameTargetId, handlePasteData]);
  const handleSetSelection = useCallback(
    (ids: string[]): void => {
      const references = inspectedContainerReferences.filter((r) =>
        ids.includes(r.refId)
      );
      dispatch(
        dataPanelSetInteraction(
          windowType,
          DataInteractionType.Selected,
          DataPanelType.Container,
          references
        )
      );
    },
    [inspectedContainerReferences, dispatch, windowType]
  );

  const handleClick = useCallback(
    (refId: string, e: React.MouseEvent): void => {
      e.stopPropagation();
      dispatch(
        dataPanelSetScrollX(
          windowType,
          DataPanelType.Container,
          panelKey,
          getScrollX(scrollParent)
        )
      );
      dispatch(
        dataPanelSetScrollY(
          windowType,
          DataPanelType.Container,
          panelKey,
          getScrollY(scrollParent)
        )
      );
      dispatch(dataPanelInspect(windowType, DataPanelType.Item, refId));
      dispatch(dataPanelOpen(windowType, DataPanelType.Item));
    },
    [dispatch, windowType, panelKey, scrollParent]
  );
  const handleChangeSelection = useCallback(
    (refId: string): void => {
      const reference = inspectedContainerReferences.find(
        (r) => r.refId === refId
      );
      if (reference) {
        dispatch(
          dataPanelChangeInteraction(
            windowType,
            DataInteractionType.Selected,
            DataPanelType.Container,
            reference
          )
        );
      }
    },
    [inspectedContainerReferences, dispatch, windowType]
  );
  const handleToggleSelection = useCallback(
    (refId: string): void => {
      const reference = inspectedContainerReferences.find(
        (r) => r.refId === refId
      );
      if (reference) {
        dispatch(
          dataPanelToggleInteraction(
            windowType,
            DataInteractionType.Selected,
            DataPanelType.Container,
            reference
          )
        );
      }
    },
    [inspectedContainerReferences, dispatch, windowType]
  );
  const handleMultiSelection = useCallback(
    (refId: string, ids: string[]): void => {
      const reference = inspectedContainerReferences.find(
        (r) => r.refId === refId
      );
      const references = inspectedContainerReferences.filter((r) =>
        ids.includes(r.refId)
      );
      if (reference) {
        dispatch(
          dataPanelMultiInteraction(
            windowType,
            DataInteractionType.Selected,
            DataPanelType.Container,
            references,
            reference
          )
        );
      }
    },
    [inspectedContainerReferences, dispatch, windowType]
  );
  const handleSelectNoneShortcut = useCallback(() => {
    if (openPanel !== DataPanelType.Container || changeNameTargetId !== "") {
      return;
    }
    handleSetSelection([]);
  }, [openPanel, changeNameTargetId, handleSetSelection]);
  const handleSelectAllShortcut = useCallback(() => {
    if (openPanel !== DataPanelType.Container || changeNameTargetId !== "") {
      return;
    }
    handleSetSelection(Object.keys(inspectedContainers));
  }, [openPanel, changeNameTargetId, inspectedContainers, handleSetSelection]);

  const handleSetNodePositions = useCallback(
    (positions: { [refId: string]: Vector2 }): void => {
      if (mode === Mode.Test) {
        return;
      }
      const newDatas = Object.keys(positions)
        .filter(
          (refId) =>
            (isBlockData(inspectedContainers[refId]) &&
              positions[refId].x !==
                (inspectedContainers[refId] as BlockData).nodePosition.x) ||
            positions[refId].y !==
              (inspectedContainers[refId] as BlockData).nodePosition.y
        )
        .map((element) => ({
          ...inspectedContainers[element],
          nodePosition: { ...positions[element] },
        }));

      dispatch(projectInsertData(newDatas, "Move"));
    },
    [mode, inspectedContainers, dispatch]
  );
  const handleEdit = useCallback(
    (refId: string): void => {
      if (refId) {
        handleSetChangeNameTargetId(refId);
      }
    },
    [handleSetChangeNameTargetId]
  );
  const handleRename = useCallback((): void => {
    if (selectedContainerReferences.length > 0) {
      // Rename the first selected item
      const firstSelectedReference =
        selectedContainerReferences[0] as ContainerReference;
      handleSetChangeNameTargetId(firstSelectedReference.refId);

      dispatch(
        dataPanelSetInteraction(
          windowType,
          DataInteractionType.Selected,
          DataPanelType.Container,
          [firstSelectedReference]
        )
      );
    }
  }, [
    selectedContainerReferences,
    handleSetChangeNameTargetId,
    dispatch,
    windowType,
  ]);
  const handleChangeName = useCallback(
    (refId: string, name: string): void => {
      if (refId) {
        const container = inspectedContainers[refId];
        if (name !== container.name) {
          const newData = {
            ...container,
            name,
          };
          dispatch(projectInsertData([newData], "Rename"));
        }
      }
      handleSetChangeNameTargetId("");
    },
    [inspectedContainers, handleSetChangeNameTargetId, dispatch]
  );

  const onSelectContainer = useCallback(
    (reference: ContainerReference): void => {
      dispatch(
        dataPanelSetInteraction(
          windowType,
          DataInteractionType.Selected,
          DataPanelType.Container,
          [reference]
        )
      );
    },
    [dispatch, windowType]
  );

  const {
    onPreviousContainer: selectPreviousContainer,
    onNextContainer: selectNextContainer,
  } = useContainerNavigation(
    state.present,
    windowType,
    selectedContainerIds,
    onSelectContainer
  );
  const handleSelectPreviousContainerShortcut = (e: AccessibleEvent): void => {
    if (openPanel !== DataPanelType.Container) {
      return;
    }
    e.preventDefault();
    selectPreviousContainer();
  };
  const handleSelectNextContainerShortcut = (e: AccessibleEvent): void => {
    if (openPanel !== DataPanelType.Container) {
      return;
    }
    e.preventDefault();
    selectNextContainer();
  };

  const handleDataAreaRef = useCallback((instance: HTMLDivElement | null) => {
    if (instance) {
      setDataAreaElement(instance);
    }
  }, []);
  const handlePanCanvas = useCallback(() => null, []);
  const handleZoomCanvas = useCallback(({ scale }) => {
    setCurrentScale(scale);
  }, []);
  const handleOpenSearch = useCallback(() => {
    dispatch(dataPanelSearch(windowType, DataPanelType.Container, ""));
  }, [dispatch, windowType]);
  const handleCloseSearch = useCallback(() => {
    dispatch(dataPanelSearch(windowType, DataPanelType.Container));
  }, [dispatch, windowType]);
  const handleSearch = useCallback(
    (value?: string) => {
      dispatch(dataPanelSearch(windowType, DataPanelType.Container, value));
    },
    [windowType, dispatch]
  );
  const handleCenterChart = useCallback(() => {
    events.onFocusData.emit({
      ids: Object.keys(inspectedContainers),
    });
  }, [inspectedContainers, events.onFocusData]);

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);

  useEffect(() => {
    if (initialRender.current) {
      // Don't clear on first render
      initialRender.current = false;
      return;
    }

    // Close context menu and search menu when user changes parent container id
    if (search) {
      handleSearch();
    }
  }, [parentContainerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      scrollId === panelKey &&
      scrollParent &&
      scrollX !== undefined &&
      scrollY !== undefined
    ) {
      window.requestAnimationFrame(() => {
        setScrollX(scrollParent, scrollX);
        setScrollY(scrollParent, scrollY);
      });
    }
  }, [panelKey, scrollId, scrollParent, scrollX, scrollY]);

  useSelectionShortcuts(handleSelectNoneShortcut, handleSelectAllShortcut);
  useDeleteShortcuts(handleRemoveDataShortcut);
  useClipboardShortcuts(
    handleCutDataShortcut,
    handleCopyDataShortcut,
    handlePasteDataShortcut
  );
  useRenameShortcuts(handleRename);
  useArrowShortcuts(
    handleSelectPreviousContainerShortcut,
    handleSelectNextContainerShortcut,
    () => null,
    () => null
  );

  const count = useMemo(
    () => Object.keys(inspectedContainers).length,
    [inspectedContainers]
  );

  const addInstruction = useMemo(
    () =>
      format(instructions[InstructionType.None], {
        target: headerInfo.pluralName,
      }),
    [headerInfo]
  );

  const isAllSelected =
    selectedContainerIds.length > 0 &&
    difference(inspectedContainerIds, selectedContainerIds).length === 0;

  const canPaste = copiedReferences[containerType].length > 0 || false;

  const menuOptions = useMemo(
    () => [
      {
        key: isAllSelected ? "Deselect All" : "Select All",
        label: isAllSelected ? "Deselect All" : "Select All",
        icon: isAllSelected ? <SquareCheckSolidIcon /> : <SquareRegularIcon />,
        persistOnClick: true,
        disabled: inspectedContainerIds?.length === 0,
      },
      {
        key: "Cut",
        label: "Cut",
        icon: <ScissorsRegularIcon />,
        disabled: selectedContainerIds?.length === 0,
      },
      {
        key: "Copy",
        label: "Copy",
        icon: <CopyRegularIcon />,
        disabled: selectedContainerIds.length === 0,
      },
      {
        key: "Paste",
        label: "Paste",
        icon: <PasteRegularIcon />,
        disabled: !canPaste,
      },
      {
        key: "Rename",
        label: "Rename",
        icon: <PencilRegularIcon />,
        disabled: selectedContainerIds?.length !== 1,
      },
      { key: "----", label: "----" },
      {
        key: "Delete",
        label: "Delete",
        icon: <TrashCanRegularIcon />,
        disabled: selectedContainerIds?.length === 0,
      },
    ],
    [
      canPaste,
      inspectedContainerIds?.length,
      isAllSelected,
      selectedContainerIds.length,
    ]
  );

  const handleScrollRef = useCallback((scrollParent: HTMLDivElement): void => {
    setScrollParent(scrollParent);
  }, []);

  const handleClickHeaderArrangementIcon = useCallback(
    (showList: boolean) => {
      dispatch(
        dataPanelSetScrollX(
          windowType,
          DataPanelType.Container,
          panelKey,
          getScrollX(scrollParent)
        )
      );
      dispatch(
        dataPanelSetScrollY(
          windowType,
          DataPanelType.Container,
          panelKey,
          getScrollY(scrollParent)
        )
      );
      dispatch(
        dataPanelSetParentContainerArrangement(
          windowType,
          showList ? ContainerArrangement.List : ContainerArrangement.Chart
        )
      );
    },
    [dispatch, windowType, panelKey, scrollParent]
  );

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
        handleSetSelection(Object.keys(inspectedContainers));
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
      if (option === "Rename") {
        window.setTimeout(() => handleRename(), 200);
      }
    },
    [
      inspectedContainers,
      handleCopyData,
      handleCutData,
      handleRemoveData,
      handlePasteData,
      handleRename,
      handleSetSelection,
    ]
  );

  const searching = Boolean(search) || search === "";
  const naming = Boolean(changeNameTargetId);

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

  const fixedStyle: CSSProperties = useMemo(
    () => ({
      position: "fixed",
      left: 0,
      right: 0,
      top: 0,
      bottom: theme.minHeight.navigationBar,
    }),
    [theme.minHeight.navigationBar]
  );

  const backgroundStyle: CSSProperties = useMemo(
    () => ({
      overflowX:
        containerPanelState.arrangement === ContainerArrangement.Chart
          ? "scroll"
          : undefined,
      overflowY:
        containerPanelState.arrangement === ContainerArrangement.Chart
          ? "scroll"
          : undefined,
      ...(containerPanelState.arrangement === ContainerArrangement.Chart &&
      portrait
        ? fixedStyle
        : {}),
    }),
    [containerPanelState.arrangement, fixedStyle, portrait]
  );

  const overlayStyle: CSSProperties = useMemo(
    () => (portrait ? { ...fixedStyle, zIndex: 2 } : undefined),
    [portrait, fixedStyle]
  );

  const centerNodesButtonStyle = useMemo(
    () => ({
      minWidth: theme.spacing(7),
      minHeight: theme.spacing(7),
      margin: theme.spacing(2),
      backgroundColor: theme.colors.darkForeground,
    }),
    [theme]
  );

  const fabLabel = `Add ${headerInfo.name}`;

  return (
    <Panel
      key={containerType}
      panelType={PanelType.Container}
      onScrollRef={handleScrollRef}
      onContextMenu={handleContextMenu}
      useWindowAsScrollContainer={
        containerPanelState.arrangement === ContainerArrangement.List
      }
      backgroundStyle={backgroundStyle}
      overlayStyle={overlayStyle}
      topChildren={
        containerPanelState.arrangement === ContainerArrangement.List ? (
          <ContainerPanelHeader
            containerType={containerType}
            search={search}
            containerPanelState={containerPanelState}
            parentContainer={parentContainer}
            projectContainers={projectContainers}
            headerBreadcrumbs={headerBreadcrumbs}
            scrollParent={scrollParent}
            onOpenSearch={handleOpenSearch}
            onCloseSearch={handleCloseSearch}
            onSearch={handleSearch}
            onBack={handleClickHeaderBackIcon}
            onBreadcrumb={handleClickHeaderBreadcrumb}
            onArrangement={handleClickHeaderArrangementIcon}
            onContextMenu={handleContextMenu}
          />
        ) : undefined
      }
      overlay={
        <>
          {containerPanelState.arrangement === ContainerArrangement.Chart && (
            <ContainerPanelHeader
              containerType={containerType}
              search={search}
              containerPanelState={containerPanelState}
              parentContainer={parentContainer}
              projectContainers={projectContainers}
              headerBreadcrumbs={headerBreadcrumbs}
              scrollParent={scrollParent}
              onOpenSearch={handleOpenSearch}
              onCloseSearch={handleCloseSearch}
              onSearch={handleSearch}
              onBack={handleClickHeaderBackIcon}
              onBreadcrumb={handleClickHeaderBreadcrumb}
              onArrangement={handleClickHeaderArrangementIcon}
              onContextMenu={handleContextMenu}
            />
          )}

          {containerPanelState.arrangement === ContainerArrangement.Chart &&
            count > 0 && (
              <PanelBottomLeftOverlay
                style={{
                  position: portrait ? "fixed" : "absolute",
                  bottom: portrait ? theme.minHeight.navigationBar : undefined,
                }}
              >
                <PanelHeaderIconButton
                  aria-label="Center Nodes"
                  icon={<CrosshairsSolidIcon />}
                  size={theme.fontSize.smallIcon}
                  onClick={handleCenterChart}
                  style={centerNodesButtonStyle}
                />
              </PanelBottomLeftOverlay>
            )}

          <PanelBottomRightOverlay
            style={{ opacity: mode === Mode.Test ? 0.5 : undefined }}
          >
            <CornerFab
              scrollParent={scrollParent}
              icon={
                <FontIcon aria-label={fabLabel} size={15}>
                  <PlusSolidIcon />
                </FontIcon>
              }
              label={fabLabel}
              color="secondary"
              shrink={
                containerPanelState.arrangement ===
                  ContainerArrangement.Chart ||
                searching ||
                naming
              }
              onClick={handleAddData}
              style={fabAreaStyle}
            />
            <InputBlocker
              active={mode === Mode.Test}
              tooltip={<EditGameTooltipContent />}
            />
          </PanelBottomRightOverlay>

          {containerPanelState.arrangement === ContainerArrangement.Chart &&
            inspectedContainerReferences.length === 0 && (
              <StyledChartEmptyPanelContentArea
                className={StyledChartEmptyPanelContentArea.displayName}
              >
                <EmptyPanelContent
                  instruction={addInstruction}
                  name={headerInfo.name}
                  icon={headerInfo.iconOn}
                  onContextMenu={handleContextMenu}
                />
              </StyledChartEmptyPanelContentArea>
            )}
        </>
      }
    >
      <ContainerPanelContent
        scrollParent={scrollParent}
        inspector={gameInspector}
        parentContainer={parentContainer}
        project={project}
        containerPanelState={containerPanelState}
        headerInfo={headerInfo}
        childContainers={inspectedContainers}
        changeNameTargetId={changeNameTargetId}
        search={search}
        draggingIds={draggingContainerIds}
        selectedIds={selectedContainerIds}
        breadcrumbIndex={breadcrumbIndex}
        previousBreadcrumbIndex={previousBreadcrumbIndex}
        onBreadcrumb={handleClickHeaderBreadcrumb}
        onSetDragging={handleSetDragging}
        onSetOrder={handleSetOrder}
        onSetSelection={handleSetSelection}
        onClick={handleClick}
        onChangeSelection={handleChangeSelection}
        onToggleSelection={handleToggleSelection}
        onMultiSelection={handleMultiSelection}
        onEdit={handleEdit}
        onChangeName={handleChangeName}
        onSetNodePositions={handleSetNodePositions}
        onDataAreaRef={handleDataAreaRef}
        onPanCanvas={handlePanCanvas}
        onZoomCanvas={handleZoomCanvas}
        onContextMenu={handleContextMenu}
      />
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

export default ContainerPanel;
