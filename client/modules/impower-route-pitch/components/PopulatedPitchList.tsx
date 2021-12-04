import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createHtmlPortalNode,
  HtmlPortalNode,
  InPortal,
  OutPortal,
} from "react-reverse-portal";
import { ConfigParameters } from "../../impower-config";
import { AggData } from "../../impower-data-state/types/interfaces/aggData";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import { SvgData } from "../../impower-icon";
import { VirtualizedItem } from "../../impower-react-virtualization";
import { layout, Portal } from "../../impower-route";
import FadeAnimation from "../../impower-route/components/animations/FadeAnimation";
import CardModal from "./CardModal";
import CardTransition from "./CardTransition";
import PitchCard from "./PitchCard";
import PostFooter from "./PostFooter";
import PostHeader from "./PostHeader";
import PostLayout from "./PostLayout";

const StyledFixedPortalContent = styled.div`
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1300;
  contain: paint size layout style;
`;

const StyledCardArea = styled.div``;

const StyledFadeArea = styled(FadeAnimation)``;

const StyledPopulatedPitchList = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
`;

const StyledCardModal = styled(CardModal)`
  display: flex;
  flex-direction: column;
  pointer-events: none;
`;

interface VirtualizedPitchCardProps {
  listEl?: HTMLDivElement;
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  id?: string;
  doc?: ProjectDocument;
  chunkIndex?: number;
  itemIndex?: number;
  compact?: boolean;
  dontFade?: boolean;
  onEdit?: (e: React.MouseEvent, id: string) => void;
  onDelete?: (e: React.MouseEvent, id: string) => void;
  onChangeScore?: (
    e: React.MouseEvent,
    score: number,
    pitchId: string,
    contributionId?: string
  ) => void;
  onKudo?: (
    e: React.MouseEvent | React.ChangeEvent,
    kudoed: boolean,
    pitchId: string,
    contributionId: string,
    data: AggData
  ) => void;
  onCreateContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onUpdateContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onDeleteContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string
  ) => void;
  onEnter?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
  onEntered?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
  onExit?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
  onExited?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
}
const VirtualizedPitchCard = React.memo((props: VirtualizedPitchCardProps) => {
  const {
    listEl,
    config,
    icons,
    id,
    doc,
    chunkIndex,
    itemIndex,
    compact,
    dontFade,
    onEdit,
    onDelete,
    onChangeScore,
    onKudo,
    onCreateContribution,
    onUpdateContribution,
    onDeleteContribution,
    onEnter,
    onEntered,
    onExit,
    onExited,
  } = props;

  const openedRef = useRef<boolean>(false);
  const cardRef = useRef<HTMLDivElement>();
  const modalRef = useRef<HTMLDivElement>();
  const postLayoutRef = useRef<HTMLDivElement>();
  const buttonRef = useRef<HTMLButtonElement>();
  const scrollbarSpacerRef = useRef<HTMLDivElement>();
  const footerRef = useRef<HTMLDivElement>();
  const kudoToolbarRef = useRef<HTMLDivElement>();
  const contributionToolbarRef = useRef<HTMLDivElement>();
  const dividerRef = useRef<HTMLDivElement>();
  const openedActionsRef = useRef<HTMLDivElement>();
  const closedActionsRef = useRef<HTMLDivElement>();
  const headerTitleRef = useRef<HTMLDivElement>();

  const [opened, setOpened] = useState<boolean>(false);
  const [modeState, setModeState] = useState<"kudo" | "contribute">(
    "contribute"
  );
  const [titleEl, setTitleEl] = useState<HTMLDivElement>();
  const [titleHeight, setTitleHeight] = useState<number>();
  const [headerEl, setHeaderEl] = useState<HTMLDivElement>();
  const [headerSpacerEl, setHeaderSpacerEl] = useState<HTMLDivElement>();
  const [cardEl, setCardEl] = useState<HTMLDivElement>(null);
  const [scrollParent, setScrollParent] = useState<HTMLDivElement>();
  const [contributionsMounted, setContributionsMounted] = useState(false);

  const theme = useTheme();
  const maxWidth = theme.breakpoints.values.sm;

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.p !== prevState?.p) {
        const open = currState?.p === id;
        openedRef.current = open;
        setOpened(openedRef.current);
      }
    },
    [id]
  );
  const [openPitchDialog, closePitchDialog] = useDialogNavigation(
    "p",
    handleBrowserNavigation
  );

  const handlePostLayoutRef = useCallback((instance: HTMLDivElement): void => {
    if (instance) {
      postLayoutRef.current = instance;
      setScrollParent(instance);
    }
  }, []);

  const handleHeaderRef = useCallback((instance: HTMLDivElement) => {
    if (instance) {
      setHeaderEl(instance);
    }
  }, []);

  const handleHeaderSpacerRef = useCallback((instance: HTMLDivElement) => {
    if (instance) {
      setHeaderSpacerEl(instance);
    }
  }, []);

  const handleCardRef = useCallback((instance: HTMLDivElement) => {
    if (instance) {
      cardRef.current = instance;
      setCardEl(instance);
    }
  }, []);

  const handleTitleRef = useCallback((instance: HTMLDivElement) => {
    if (instance) {
      window.requestAnimationFrame(() => {
        setTitleEl(instance);
        setTitleHeight(instance.getBoundingClientRect().height);
      });
    }
  }, []);

  useEffect(() => {
    if (!titleEl) {
      return (): void => null;
    }
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (entry.target === titleEl) {
        const { height } = entry.contentRect;
        if (height > 0) {
          setTitleHeight(height);
        }
      }
    });
    resizeObserver.observe(titleEl);
    return (): void => {
      resizeObserver.disconnect();
    };
  }, [titleEl]);

  const pitchToolbarEl = useMemo(
    () =>
      typeof document !== "undefined"
        ? document.getElementById("pitch-toolbar")
        : undefined,
    []
  );
  const pitchFilterEl = useMemo(
    () =>
      typeof document !== "undefined"
        ? document.getElementById("pitch-filter-header")
        : undefined,
    []
  );
  const addPitchToolbarEl = useMemo(
    () =>
      typeof document !== "undefined"
        ? document.getElementById("add-pitch-toolbar")
        : undefined,
    []
  );

  const handleEnter = useCallback(() => {
    if (onEnter) {
      onEnter(id, chunkIndex, itemIndex);
    }
    if (closedActionsRef.current) {
      closedActionsRef.current.style.visibility = "hidden";
    }
    if (openedActionsRef.current) {
      openedActionsRef.current.style.visibility = "visible";
    }
  }, [chunkIndex, id, itemIndex, onEnter]);

  const handleEntering = useCallback(() => {
    if (kudoToolbarRef.current) {
      kudoToolbarRef.current.style.display = "block";
    }
    if (dividerRef.current) {
      dividerRef.current.style.opacity = "1";
    }
    if (footerRef.current) {
      footerRef.current.style.display = "flex";
    }
    if (contributionToolbarRef.current) {
      contributionToolbarRef.current.style.display = "block";
    }
    if (modalRef.current) {
      modalRef.current.style.pointerEvents = "auto";
    }
    if (buttonRef.current) {
      buttonRef.current.classList.add("Mui-disabled");
    }
    if (postLayoutRef.current) {
      postLayoutRef.current.style.overflowY = "scroll";
      postLayoutRef.current.style.overflowX = "hidden";
      postLayoutRef.current.style.overscrollBehavior = "none";
      postLayoutRef.current.style.borderRadius = "0";
    }
    if (scrollbarSpacerRef.current) {
      scrollbarSpacerRef.current.style.overflow = "visible";
    }
    if (headerSpacerEl) {
      headerSpacerEl.style.display = null;
    }
  }, [headerSpacerEl]);

  const handleEntered = useCallback(() => {
    window.requestAnimationFrame(() => {
      if (headerTitleRef.current) {
        headerTitleRef.current.style.display = null;
      }
      if (pitchToolbarEl) {
        pitchToolbarEl.style.display = "none";
      }
      if (pitchFilterEl) {
        pitchFilterEl.style.display = "none";
      }
      if (listEl) {
        listEl.style.display = "none";
      }
      if (addPitchToolbarEl) {
        addPitchToolbarEl.style.display = "none";
      }
      setContributionsMounted(true);
      if (onEntered) {
        onEntered(id, chunkIndex, itemIndex);
      }
    });
  }, [
    pitchToolbarEl,
    pitchFilterEl,
    listEl,
    addPitchToolbarEl,
    onEntered,
    id,
    chunkIndex,
    itemIndex,
  ]);

  const handleExit = useCallback(() => {
    if (onExit) {
      onExit(id, chunkIndex, itemIndex);
    }
    if (kudoToolbarRef.current) {
      kudoToolbarRef.current.style.display = "none";
    }
    if (postLayoutRef.current) {
      postLayoutRef.current.classList.add("hide-scrollbar");
    }
    if (pitchToolbarEl) {
      pitchToolbarEl.style.display = null;
    }
    if (pitchFilterEl) {
      pitchFilterEl.style.display = null;
    }
    if (listEl) {
      listEl.style.display = null;
    }
    if (addPitchToolbarEl) {
      addPitchToolbarEl.style.display = null;
    }
    if (contributionToolbarRef.current) {
      contributionToolbarRef.current.style.display = "none";
    }
    if (closedActionsRef.current) {
      closedActionsRef.current.style.visibility = "visible";
    }
    if (openedActionsRef.current) {
      openedActionsRef.current.style.visibility = "hidden";
    }
  }, [
    onExit,
    pitchToolbarEl,
    pitchFilterEl,
    listEl,
    addPitchToolbarEl,
    id,
    chunkIndex,
    itemIndex,
  ]);

  const handleExited = useCallback(() => {
    if (headerTitleRef.current) {
      headerTitleRef.current.style.display = "none";
    }
    if (footerRef.current) {
      footerRef.current.style.display = "none";
    }
    if (dividerRef.current) {
      dividerRef.current.style.opacity = "0";
    }
    if (modalRef.current) {
      modalRef.current.style.pointerEvents = null;
    }
    if (buttonRef.current) {
      buttonRef.current.classList.remove("Mui-disabled");
    }
    if (postLayoutRef.current) {
      postLayoutRef.current.style.overflow = "hidden";
      postLayoutRef.current.style.borderRadius = null;
    }
    if (scrollbarSpacerRef.current) {
      scrollbarSpacerRef.current.style.overflowY = "scroll";
      scrollbarSpacerRef.current.style.overflowX = "hidden";
    }
    if (postLayoutRef.current) {
      postLayoutRef.current.classList.remove("hide-scrollbar");
    }
    if (headerSpacerEl) {
      headerSpacerEl.style.display = "none";
    }
    setContributionsMounted(false);
    if (onExited) {
      onExited(id, chunkIndex, itemIndex);
    }
  }, [chunkIndex, headerSpacerEl, id, itemIndex, onExited]);

  const handleOpen = useCallback(
    (
      e: React.MouseEvent<Element, MouseEvent>,
      action: "kudo" | "contribute"
    ): void => {
      if (!openedRef.current) {
        openedRef.current = true;
        setModeState(action);
        setOpened(openedRef.current);
        openPitchDialog(id, doc?.name);
      }
    },
    [doc?.name, id, openPitchDialog]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();
      if (openedRef.current) {
        openedRef.current = false;
        setOpened(openedRef.current);
        closePitchDialog();
      }
    },
    [closePitchDialog]
  );

  const handleChangeScore = useCallback(
    (e: React.MouseEvent<Element, MouseEvent>, score: number): void => {
      if (onChangeScore) {
        onChangeScore(e, score, id);
      }
    },
    [id, onChangeScore]
  );

  const handleEditPitch = useCallback(
    (e: React.MouseEvent<Element, MouseEvent>): void => {
      if (onEdit) {
        onEdit(e, id);
      }
    },
    [id, onEdit]
  );

  const handleDeletePitch = useCallback(
    (e: React.MouseEvent<Element, MouseEvent>): void => {
      if (onDelete) {
        onDelete(e, id);
      }
    },
    [id, onDelete]
  );

  const postLayoutStyle: React.CSSProperties = useMemo(
    () => ({
      boxShadow: compact ? undefined : theme.shadows[1],
      borderTop:
        compact && itemIndex > 0 ? "1px solid rgba(0, 0, 0, 0.12)" : undefined,
      overflow: "hidden",
    }),
    [compact, itemIndex, theme.shadows]
  );

  const fadeAreaStyle = useMemo(
    () => (compact ? {} : { padding: theme.spacing(1, 0) }),
    [compact, theme]
  );

  return (
    <StyledCardArea>
      <StyledFadeArea
        initial={dontFade ? 1 : 0}
        animate={1}
        duration={0.15}
        style={fadeAreaStyle}
      >
        <StyledCardModal
          ref={modalRef}
          open={opened}
          disableRestoreFocus
          disableEnforceFocus
          keepMounted
          disablePortal
          closeAfterTransition
          onClose={handleClose}
        >
          <CardTransition
            in={opened}
            cardEl={cardEl}
            offsetHeaderEl={headerEl}
            offsetHeaderShadowEl={headerSpacerEl}
            offsetHeaderHeight={layout.size.minHeight.titleBar}
            scrollEl={scrollParent}
            maxWidth={maxWidth}
            onEnter={handleEnter}
            onEntering={handleEntering}
            onEntered={handleEntered}
            onExit={handleExit}
            onExited={handleExited}
            onClickBackdrop={handleClose}
          >
            <PostLayout
              ref={handlePostLayoutRef}
              style={postLayoutStyle}
              compact={compact}
            >
              <PostHeader
                initiallyHidden
                pitchDoc={doc}
                titleHeight={titleHeight}
                headerRef={handleHeaderRef}
                spacerRef={handleHeaderSpacerRef}
                titleRef={headerTitleRef}
                delisted={doc?.delisted}
                label={`Impower Pitch`}
                onBack={handleClose}
              />
              <PitchCard
                cardRef={handleCardRef}
                buttonRef={buttonRef}
                scrollbarSpacerRef={scrollbarSpacerRef}
                openedActionsRef={openedActionsRef}
                closedActionsRef={closedActionsRef}
                titleRef={handleTitleRef}
                config={config}
                icons={icons}
                id={id}
                doc={doc}
                onOpen={handleOpen}
                onChangeScore={handleChangeScore}
                onEdit={handleEditPitch}
                onDelete={handleDeletePitch}
              />
              <PostFooter
                scrollParent={scrollParent}
                footerRef={footerRef}
                kudoToolbarRef={kudoToolbarRef}
                contributionToolbarRef={contributionToolbarRef}
                pitchId={id}
                doc={doc}
                kudoCount={doc?.kudos}
                contributionCount={doc?.contributions}
                mountList={contributionsMounted}
                mode={modeState}
                onKudo={onKudo}
                onCreateContribution={onCreateContribution}
                onUpdateContribution={onUpdateContribution}
                onDeleteContribution={onDeleteContribution}
              />
            </PostLayout>
          </CardTransition>
        </StyledCardModal>
      </StyledFadeArea>
    </StyledCardArea>
  );
});

interface VirtualizedPitchChunkProps {
  listEl?: HTMLDivElement;
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  chunkIndex?: number;
  chunkEntries?: [string, ProjectDocument][];
  chunkNodes?: HtmlPortalNode<React.Component>[];
  compact?: boolean;
  dontFade?: boolean;
  onChangeScore?: (
    e: React.MouseEvent,
    score: number,
    pitchId: string,
    contributionId?: string
  ) => void;
  onEdit?: (e: React.MouseEvent, id: string) => void;
  onDelete?: (e: React.MouseEvent, id: string) => void;
  onKudo?: (
    e: React.MouseEvent | React.ChangeEvent,
    kudoed: boolean,
    pitchId: string,
    contributionId: string,
    data: AggData
  ) => void;
  onCreateContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onUpdateContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onDeleteContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string
  ) => void;
  onEnter?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
  onEntered?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
  onExit?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
  onExited?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
}

const VirtualizedPitchChunk = React.memo(
  (props: VirtualizedPitchChunkProps): JSX.Element => {
    const {
      listEl,
      config,
      icons,
      chunkIndex,
      chunkEntries,
      chunkNodes,
      compact,
      dontFade,
      onChangeScore,
      onEdit,
      onDelete,
      onKudo,
      onCreateContribution,
      onUpdateContribution,
      onDeleteContribution,
      onEnter,
      onEntered,
      onExit,
      onExited,
    } = props;

    const itemContentRefs = useRef<{
      [id: string]: { current: HTMLDivElement };
    }>({});

    const [openedItemIndex, setOpenedItemIndex] = useState<number>();
    const [isolatedItemIndex, setIsolatedItemIndex] = useState<number>();

    const handleEnter = useCallback(
      (id: string, chunk: number, index: number) => {
        if (onEnter) {
          onEnter(id, chunk, index);
        }
        setOpenedItemIndex(index);
        const itemWrapperEl =
          itemContentRefs.current?.[id]?.current?.parentElement;
        if (itemWrapperEl) {
          itemWrapperEl.style.zIndex = "1300";
          itemWrapperEl.style.contain = null;
        }
      },
      [onEnter]
    );

    const handleEntered = useCallback(
      (id: string, chunk: number, index: number) => {
        setIsolatedItemIndex(index);
        if (onEntered) {
          onEntered(id, chunk, index);
        }
      },
      [onEntered]
    );

    const handleExit = useCallback(
      (id: string, chunk: number, index: number) => {
        if (onExit) {
          onExit(id, chunk, index);
        }
      },
      [onExit]
    );

    const handleExited = useCallback(
      (id: string, chunk: number, index: number) => {
        const itemWrapperEl =
          itemContentRefs.current?.[id]?.current?.parentElement;
        if (itemWrapperEl) {
          itemWrapperEl.style.zIndex = null;
          itemWrapperEl.style.contain = "size layout paint style";
        }
        setOpenedItemIndex(null);
        setIsolatedItemIndex(null);
        if (onExited) {
          onExited(id, chunk, index);
        }
      },
      [onExited]
    );

    return (
      <>
        {chunkEntries.map(([id, doc], itemIndex) => {
          if (!itemContentRefs.current[id]) {
            itemContentRefs.current[id] = { current: null };
          }
          const chunkNode = chunkNodes?.[itemIndex];
          const opened = openedItemIndex === itemIndex;
          const isolated = isolatedItemIndex === itemIndex;
          if (!chunkNode) {
            return (
              <VirtualizedItem
                key={id}
                contentRef={itemContentRefs.current[id]}
                visibleOffset={0}
                index={itemIndex}
                mounted
                dontMeasure={opened}
              >
                <VirtualizedPitchCard
                  listEl={listEl}
                  config={config}
                  icons={icons}
                  id={id}
                  doc={doc}
                  compact={compact}
                  dontFade={dontFade}
                  onChangeScore={onChangeScore}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onKudo={onKudo}
                  onCreateContribution={onCreateContribution}
                  onUpdateContribution={onUpdateContribution}
                  onDeleteContribution={onDeleteContribution}
                  onEnter={handleEnter}
                  onEntered={handleEntered}
                  onExit={handleExit}
                  onExited={handleExited}
                />
              </VirtualizedItem>
            );
          }
          const InWrapper = chunkNode ? InPortal : React.Fragment;
          const OutWrapper = chunkNode ? OutPortal : React.Fragment;
          return (
            <VirtualizedItem
              key={id}
              contentRef={itemContentRefs.current[id]}
              visibleOffset={0}
              index={itemIndex}
              mounted
              dontMeasure={opened}
            >
              <InWrapper node={chunkNode}>
                <VirtualizedPitchCard
                  listEl={listEl}
                  config={config}
                  icons={icons}
                  id={id}
                  doc={doc}
                  chunkIndex={chunkIndex}
                  itemIndex={itemIndex}
                  compact={compact}
                  dontFade={dontFade}
                  onChangeScore={onChangeScore}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onKudo={onKudo}
                  onCreateContribution={onCreateContribution}
                  onUpdateContribution={onUpdateContribution}
                  onDeleteContribution={onDeleteContribution}
                  onEnter={handleEnter}
                  onEntered={handleEntered}
                  onExit={handleExit}
                  onExited={handleExited}
                />
              </InWrapper>
              {isolated ? (
                <Portal>
                  <StyledFixedPortalContent>
                    <OutWrapper node={chunkNode}></OutWrapper>
                  </StyledFixedPortalContent>
                </Portal>
              ) : (
                <OutWrapper node={chunkNode} />
              )}
            </VirtualizedItem>
          );
        })}
      </>
    );
  }
);

interface PopulatedPitchListProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  pitchDocs?: { [id: string]: ProjectDocument };
  chunkMap?: { [id: string]: number };
  lastLoadedChunk?: number;
  compact?: boolean;
  dontFade?: boolean;
  style?: React.CSSProperties;
  onChangeScore?: (
    e: React.MouseEvent,
    score: number,
    pitchId: string,
    contributionId?: string
  ) => void;
  onEdit?: (e: React.MouseEvent, id: string) => void;
  onDelete?: (e: React.MouseEvent, id: string) => void;
  onKudo?: (
    e: React.MouseEvent | React.ChangeEvent,
    kudoed: boolean,
    pitchId: string,
    contributionId: string,
    data: AggData
  ) => void;
  onCreateContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onUpdateContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onDeleteContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string
  ) => void;
}

const PopulatedPitchList = React.memo(
  (props: PopulatedPitchListProps): JSX.Element => {
    const {
      config,
      icons,
      pitchDocs,
      chunkMap,
      lastLoadedChunk,
      compact,
      dontFade,
      style,
      onChangeScore,
      onEdit,
      onDelete,
      onKudo,
      onCreateContribution,
      onUpdateContribution,
      onDeleteContribution,
    } = props;

    const pitchEntries = useMemo(
      () => Object.entries(pitchDocs || {}),
      [pitchDocs]
    );
    const pitchChunks = useMemo(() => {
      const chunks: [string, ProjectDocument][][] = [];
      pitchEntries.forEach(([id, doc]) => {
        const chunkIndex = chunkMap?.[id] || 0;
        if (!chunks[chunkIndex]) {
          chunks[chunkIndex] = [];
        }
        chunks[chunkIndex].push([id, doc]);
      });
      return chunks;
    }, [chunkMap, pitchEntries]);

    const chunkContentRefs = useRef<{ current: HTMLDivElement }[]>([]);
    const nodesRef = useRef<HtmlPortalNode<Component>[][]>([]);

    const chunkVisiblityRef = useRef<boolean[]>([true, true]);
    const mountedChunksRef = useRef<number[]>([lastLoadedChunk]);
    const [mountedChunks, setMountedChunks] = useState<number[]>(
      mountedChunksRef.current
    );

    useEffect(() => {
      if (lastLoadedChunk) {
        mountedChunksRef.current = [lastLoadedChunk];
        chunkVisiblityRef.current[lastLoadedChunk] = true;
        mountedChunksRef.current.push(lastLoadedChunk - 1);
        setMountedChunks(mountedChunksRef.current);
      }
    }, [lastLoadedChunk]);

    const handleVisibilityChange = useCallback(
      (chunk: number, visible?: boolean) => {
        chunkVisiblityRef.current[chunk] = visible;
        if (visible) {
          if (!mountedChunksRef.current.includes(chunk)) {
            mountedChunksRef.current = [chunk];
            if (chunkVisiblityRef.current[chunk - 1]) {
              mountedChunksRef.current.push(chunk - 1);
            }
            if (chunkVisiblityRef.current[chunk + 1]) {
              mountedChunksRef.current.push(chunk + 1);
            }
            setMountedChunks(mountedChunksRef.current);
          }
        }
      },
      []
    );

    const handleEnter = useCallback((id: string, chunk: number) => {
      const chunkWrapperEl = chunkContentRefs.current?.[chunk]?.current
        ?.parentElement as HTMLElement;
      if (chunkWrapperEl) {
        chunkWrapperEl.style.contain = null;
      }
    }, []);

    const handleEntered = useCallback(() => {
      mountedChunksRef.current.forEach((chunkIndex) => {
        const chunkRef = chunkContentRefs.current?.[chunkIndex];
        if (chunkRef?.current) {
          chunkRef.current.style.display = "none";
        }
      });
    }, []);

    const handleExit = useCallback(() => {
      mountedChunksRef.current.forEach((chunkIndex) => {
        const chunkRef = chunkContentRefs.current?.[chunkIndex];
        if (chunkRef?.current) {
          chunkRef.current.style.display = null;
        }
      });
    }, []);

    const handleExited = useCallback((id: string, chunk: number) => {
      const chunkWrapperEl = chunkContentRefs.current?.[chunk]?.current
        ?.parentElement as HTMLElement;
      if (chunkWrapperEl) {
        chunkWrapperEl.style.contain = "size layout paint style";
      }
    }, []);

    if (!pitchDocs) {
      return null;
    }

    return (
      <>
        <StyledPopulatedPitchList style={style}>
          {pitchChunks.map((chunkEntries, chunkIndex) => {
            if (
              nodesRef.current[chunkIndex]?.length !== chunkEntries?.length &&
              typeof document !== "undefined"
            ) {
              if (!nodesRef.current[chunkIndex]) {
                nodesRef.current[chunkIndex] = [];
              }
              for (let i = 0; i < chunkEntries?.length; i += 1) {
                nodesRef.current[chunkIndex][i] =
                  nodesRef.current[chunkIndex][i] ||
                  createHtmlPortalNode({
                    attributes: {
                      class: "out-portal",
                    },
                  });
              }
            }
            if (!chunkContentRefs.current[chunkIndex]) {
              chunkContentRefs.current[chunkIndex] = { current: null };
            }
            return (
              <VirtualizedItem
                key={chunkIndex}
                contentRef={chunkContentRefs.current[chunkIndex]}
                visibleOffset={0}
                index={chunkIndex}
                mounted={mountedChunks.includes(chunkIndex)}
                onVisibilityChange={handleVisibilityChange}
              >
                <VirtualizedPitchChunk
                  config={config}
                  icons={icons}
                  chunkIndex={chunkIndex}
                  chunkEntries={chunkEntries}
                  chunkNodes={nodesRef.current[chunkIndex]}
                  compact={compact}
                  dontFade={dontFade}
                  onChangeScore={onChangeScore}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onKudo={onKudo}
                  onCreateContribution={onCreateContribution}
                  onUpdateContribution={onUpdateContribution}
                  onDeleteContribution={onDeleteContribution}
                  onEnter={handleEnter}
                  onEntered={handleEntered}
                  onExit={handleExit}
                  onExited={handleExited}
                />
              </VirtualizedItem>
            );
          })}
        </StyledPopulatedPitchList>
      </>
    );
  }
);

export default PopulatedPitchList;
