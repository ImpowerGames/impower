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
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import { VirtualizedItem } from "../../impower-react-virtualization";
import { FadeAnimation, layout, Portal } from "../../impower-route";
import { getPreviewAspectRatio } from "../utils/getPreviewAspectRatio";
import CardModal from "./CardModal";
import CardTransition from "./CardTransition";
import ContributionCard from "./ContributionCard";
import PostFooter from "./PostFooter";
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

const StyledPopulatedContributionList = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
`;

const StyledCardModal = styled(CardModal)`
  display: flex;
  flex-direction: column;
  pointer-events: none;
`;

interface VirtualizedContributionCardProps {
  scrollParent?: HTMLElement;
  chunkIndex?: number;
  itemIndex?: number;
  pitchId: string;
  pitchDoc: ProjectDocument;
  contributionId: string;
  doc: ContributionDocument;
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
  onEdit?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string
  ) => void;
  onDelete?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId?: string
  ) => void;
  onEnter?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
  onEntered?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
  onExit?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
  onExited?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
}
const VirtualizedContributionCard = React.memo(
  (props: VirtualizedContributionCardProps) => {
    const {
      scrollParent,
      chunkIndex,
      itemIndex,
      pitchId,
      pitchDoc,
      contributionId,
      doc,
      onChangeScore,
      onKudo,
      onEdit,
      onDelete,
      onEnter,
      onEntered,
      onExit,
      onExited,
    } = props;

    const openedRef = useRef<boolean>(false);
    const modalRef = useRef<HTMLDivElement>();
    const postLayoutRef = useRef<HTMLDivElement>();
    const buttonRef = useRef<HTMLButtonElement>();
    const scrollbarSpacerRef = useRef<HTMLDivElement>();
    const truncatedIndicatorRef = useRef<HTMLDivElement>();
    const headerRef = useRef<HTMLDivElement>();
    const footerRef = useRef<HTMLDivElement>();
    const avatarUserRef = useRef<HTMLDivElement>();
    const avatarBackRef = useRef<HTMLDivElement>();
    const kudoToolbarRef = useRef<HTMLDivElement>();

    const [opened, setOpened] = useState<boolean>(false);
    const [expanded, setExpanded] = useState<boolean>(false);
    const [cardEl, setCardEl] = useState<HTMLDivElement>(null);
    const [headerEl, setHeaderEl] = useState<HTMLDivElement>();
    const [headerSentinelEl, setHeaderSentinelEl] = useState<HTMLDivElement>();
    const [footerEl, setFooterEl] = useState<HTMLDivElement>();
    const [footerCoverEl, setFooterCoverEl] = useState<HTMLDivElement>();
    const [postLayoutEl, setPostLayoutEl] = useState<HTMLDivElement>();
    const [contentEl, setContentEl] = useState<HTMLDivElement>();
    const [truncationAreaEl, setTruncationAreaEl] = useState<HTMLDivElement>();
    const [truncationContentEl, setTruncationContentEl] =
      useState<HTMLDivElement>();
    const [kudosMounted, setKudosMounted] = useState(false);

    const id = `${pitchId}/${contributionId}`;

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.c !== prevState?.c) {
          const open = currState?.c === id;
          openedRef.current = open;
          setOpened(openedRef.current);
        }
      },
      [id]
    );
    const [openContributionDialog, closeContributionDialog] =
      useDialogNavigation("c", handleBrowserNavigation);

    const theme = useTheme();
    const maxWidth = theme.breakpoints.values.sm;
    const postLayoutStyle = useMemo(
      () => ({
        borderRadius: 0,
        overflow: "hidden",
      }),
      []
    );

    const handlePostLayoutRef = useCallback(
      (instance: HTMLDivElement): void => {
        if (instance) {
          postLayoutRef.current = instance;
          setPostLayoutEl(instance);
        }
      },
      []
    );

    const handleCardRef = useCallback((instance: HTMLDivElement) => {
      if (instance) {
        setCardEl(instance);
      }
    }, []);

    const handleHeaderRef = useCallback((instance: HTMLDivElement) => {
      if (instance) {
        headerRef.current = instance;
        setHeaderEl(instance);
      }
    }, []);

    const handleHeaderSentinelRef = useCallback((instance: HTMLDivElement) => {
      if (instance) {
        setHeaderSentinelEl(instance);
      }
    }, []);

    const handleFooterRef = useCallback((instance: HTMLDivElement) => {
      if (instance) {
        footerRef.current = instance;
        setFooterEl(instance);
      }
    }, []);

    const handleFooterCoverRef = useCallback((instance: HTMLDivElement) => {
      if (instance) {
        setFooterCoverEl(instance);
      }
    }, []);

    const handleContentRef = useCallback((instance: HTMLDivElement) => {
      if (instance) {
        setContentEl(instance);
      }
    }, []);

    const handleTruncationAreaRef = useCallback((instance: HTMLDivElement) => {
      if (instance) {
        setTruncationAreaEl(instance);
      }
    }, []);

    const handleTruncationContentRef = useCallback(
      (instance: HTMLDivElement) => {
        if (instance) {
          setTruncationContentEl(instance);
        }
      },
      []
    );

    const handleEnter = useCallback(() => {
      if (onEnter) {
        onEnter(id, chunkIndex, itemIndex);
      }

      if (buttonRef.current) {
        buttonRef.current.classList.add("Mui-disabled");
      }
      if (modalRef.current) {
        modalRef.current.style.pointerEvents = "auto";
      }
      if (truncatedIndicatorRef.current) {
        truncatedIndicatorRef.current.style.opacity = "0";
      }
      if (avatarUserRef.current) {
        avatarUserRef.current.style.opacity = "0";
        avatarBackRef.current.style.pointerEvents = "none";
      }
      if (avatarBackRef.current) {
        avatarBackRef.current.style.opacity = "1";
        avatarBackRef.current.style.pointerEvents = "auto";
      }
      if (headerRef.current && headerRef.current.firstElementChild) {
        (
          headerRef.current.firstElementChild as HTMLElement
        ).style.backgroundColor = "white";
      }
      setExpanded(true);
    }, [chunkIndex, id, itemIndex, onEnter]);

    const handleEntering = useCallback(() => {
      if (kudoToolbarRef.current) {
        kudoToolbarRef.current.style.display = "block";
      }
      if (postLayoutRef.current) {
        postLayoutRef.current.style.overflow = "visible";
      }
      if (scrollbarSpacerRef.current) {
        scrollbarSpacerRef.current.style.display = "block";
      }
    }, []);

    const handleEntered = useCallback(() => {
      if (postLayoutRef.current) {
        postLayoutRef.current.style.overflowY = "scroll";
        postLayoutRef.current.style.overflowX = "hidden";
        postLayoutRef.current.style.overscrollBehavior = "none";
      }
      if (scrollbarSpacerRef.current) {
        scrollbarSpacerRef.current.style.display = null;
      }
      window.requestAnimationFrame(() => {
        if (scrollParent) {
          scrollParent.style.display = "none";
        }
        setKudosMounted(true);
        if (onEntered) {
          onEntered(id, chunkIndex, itemIndex);
        }
      });
    }, [scrollParent, onEntered, id, chunkIndex, itemIndex]);

    const handleExit = useCallback(() => {
      if (onExit) {
        onExit(id);
      }
      if (kudoToolbarRef.current) {
        kudoToolbarRef.current.style.display = "none";
      }
      if (postLayoutRef.current) {
        postLayoutRef.current.scrollTop = 0;
        postLayoutRef.current.style.overflow = "visible";
      }
      if (scrollbarSpacerRef.current) {
        scrollbarSpacerRef.current.style.display = "block";
      }
      if (truncatedIndicatorRef.current) {
        truncatedIndicatorRef.current.style.opacity = "1";
      }
      if (avatarUserRef.current) {
        avatarUserRef.current.style.opacity = "1";
        avatarBackRef.current.style.pointerEvents = "auto";
      }
      if (avatarBackRef.current) {
        avatarBackRef.current.style.opacity = "0";
        avatarBackRef.current.style.pointerEvents = "none";
      }
      if (scrollParent) {
        scrollParent.style.display = null;
      }
    }, [id, onExit, scrollParent]);

    const handleExited = useCallback(() => {
      if (scrollbarSpacerRef.current) {
        scrollbarSpacerRef.current.style.display = null;
      }
      if (modalRef.current) {
        modalRef.current.style.pointerEvents = null;
      }
      if (buttonRef.current) {
        buttonRef.current.classList.remove("Mui-disabled");
      }
      if (postLayoutRef.current) {
        postLayoutRef.current.style.overflow = "hidden";
      }
      if (headerRef.current && headerRef.current.firstElementChild) {
        (
          headerRef.current.firstElementChild as HTMLElement
        ).style.backgroundColor = null;
      }
      setExpanded(false);
      setKudosMounted(false);
      if (onExited) {
        onExited(id, chunkIndex, itemIndex);
      }
    }, [chunkIndex, id, itemIndex, onExited]);

    const handleOpen = useCallback((): void => {
      window.requestAnimationFrame(() => {
        if (!openedRef.current) {
          openedRef.current = true;
          setOpened(openedRef.current);
          openContributionDialog(id);
        }
      });
    }, [id, openContributionDialog]);

    const handleClose = useCallback(
      (e: React.MouseEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        window.requestAnimationFrame(() => {
          if (openedRef.current) {
            openedRef.current = false;
            setOpened(openedRef.current);
            closeContributionDialog();
          }
        });
      },
      [closeContributionDialog]
    );

    const handleChangeScore = useCallback(
      (e: React.MouseEvent<Element, MouseEvent>, score: number): void => {
        if (onChangeScore) {
          onChangeScore(e, score, pitchId, contributionId);
        }
      },
      [contributionId, onChangeScore, pitchId]
    );

    const handleEdit = useCallback(
      (e: React.MouseEvent): void => {
        if (onEdit) {
          onEdit(e, pitchId, contributionId);
        }
      },
      [contributionId, onEdit, pitchId]
    );

    const handleDelete = useCallback(
      (e: React.MouseEvent): void => {
        if (onDelete) {
          onDelete(e, pitchId, contributionId);
        }
      },
      [contributionId, onDelete, pitchId]
    );

    const previewAspectRatio = getPreviewAspectRatio(
      doc?.aspectRatio,
      doc?.square
    );
    const positionHorizontally = doc?.aspectRatio > previewAspectRatio;

    return (
      <StyledCardArea>
        <StyledFadeArea initial={0} animate={1} duration={0.15}>
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
              truncationAreaEl={truncationAreaEl}
              truncationContentEl={truncationContentEl}
              headerEl={headerEl}
              headerSentinelEl={headerSentinelEl}
              footerEl={footerEl}
              footerCoverEl={footerCoverEl}
              scrollEl={postLayoutEl}
              contentEl={contentEl}
              maxWidth={maxWidth}
              crop={
                doc?.file?.fileUrl && !positionHorizontally
                  ? doc?.crop
                  : undefined
              }
              intrinsicContentAspectRatio={doc?.aspectRatio}
              headerHeight={layout.size.minHeight.titleBar}
              footerHeight={layout.size.minHeight.titleBar}
              onEnter={handleEnter}
              onEntering={handleEntering}
              onEntered={handleEntered}
              onExit={handleExit}
              onExited={handleExited}
              onClickBackdrop={handleClose}
            >
              <PostLayout
                ref={handlePostLayoutRef}
                scrollbarSpacerRef={scrollbarSpacerRef}
                style={postLayoutStyle}
              >
                <ContributionCard
                  cardRef={handleCardRef}
                  headerRef={handleHeaderRef}
                  headerSentinelRef={handleHeaderSentinelRef}
                  footerRef={handleFooterRef}
                  footerCoverRef={handleFooterCoverRef}
                  contentRef={handleContentRef}
                  preview={!expanded}
                  buttonRef={buttonRef}
                  avatarUserRef={avatarUserRef}
                  avatarBackRef={avatarBackRef}
                  truncationAreaRef={handleTruncationAreaRef}
                  truncationContentRef={handleTruncationContentRef}
                  pitchId={pitchId}
                  pitchDoc={pitchDoc}
                  id={contributionId}
                  doc={doc}
                  onChangeScore={handleChangeScore}
                  onOpen={handleOpen}
                  onClose={handleClose}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
                <PostFooter
                  scrollParent={postLayoutEl}
                  footerRef={footerRef}
                  kudoToolbarRef={kudoToolbarRef}
                  pitchId={pitchId}
                  contributionId={contributionId}
                  doc={doc}
                  kudoCount={doc?.kudos}
                  mountList={kudosMounted}
                  mode="kudo"
                  onKudo={onKudo}
                />
              </PostLayout>
            </CardTransition>
          </StyledCardModal>
        </StyledFadeArea>
      </StyledCardArea>
    );
  }
);

interface VirtualizedContributionChunkProps {
  scrollParent?: HTMLElement;
  pitchDocs?: { [pitchId: string]: ProjectDocument };
  chunkIndex?: number;
  chunkEntries?: [string, ContributionDocument][];
  chunkNodes?: HtmlPortalNode<React.Component>[];
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
  onEdit?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string
  ) => void;
  onDelete?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId?: string
  ) => void;
  onEnter?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
  onEntered?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
  onExit?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
  onExited?: (id?: string, chunkIndex?: number, itemIndex?: number) => void;
}

const VirtualizedContributionChunk = React.memo(
  (props: VirtualizedContributionChunkProps): JSX.Element => {
    const {
      scrollParent,
      pitchDocs,
      chunkIndex,
      chunkEntries,
      chunkNodes,
      onChangeScore,
      onKudo,
      onEdit,
      onDelete,
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
        setOpenedItemIndex(null);
        setIsolatedItemIndex(null);
        const itemWrapperEl =
          itemContentRefs.current?.[id]?.current?.parentElement;
        if (itemWrapperEl) {
          itemWrapperEl.style.zIndex = null;
          itemWrapperEl.style.contain = "size layout paint style";
        }
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
          const [pitchId, contributionId] = id.split("/");
          const pitchDoc = pitchDocs?.[pitchId];
          const itemRef = itemContentRefs.current[id];
          if (!chunkNode) {
            return (
              <VirtualizedItem
                key={id}
                contentRef={itemRef}
                visibleOffset={0}
                index={itemIndex}
                mounted
                dontMeasure={opened}
              >
                <VirtualizedContributionCard
                  scrollParent={scrollParent}
                  chunkIndex={chunkIndex}
                  itemIndex={itemIndex}
                  pitchId={pitchId}
                  pitchDoc={pitchDoc}
                  contributionId={contributionId}
                  doc={doc}
                  onChangeScore={onChangeScore}
                  onKudo={onKudo}
                  onEdit={onEdit}
                  onDelete={onDelete}
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
              contentRef={itemRef}
              visibleOffset={0}
              index={itemIndex}
              mounted
              dontMeasure={opened}
            >
              <InWrapper node={chunkNode}>
                <VirtualizedContributionCard
                  scrollParent={scrollParent}
                  chunkIndex={chunkIndex}
                  itemIndex={itemIndex}
                  pitchId={pitchId}
                  pitchDoc={pitchDoc}
                  contributionId={contributionId}
                  doc={doc}
                  onChangeScore={onChangeScore}
                  onKudo={onKudo}
                  onEdit={onEdit}
                  onDelete={onDelete}
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

interface PopulatedContributionListProps {
  scrollParent?: HTMLElement;
  pitchDocs?: { [pitchId: string]: ProjectDocument };
  contributionDocs?: { [id: string]: ContributionDocument };
  chunkMap?: { [id: string]: number };
  lastLoadedChunk?: number;
  style?: React.CSSProperties;
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
  onEdit?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string
  ) => void;
  onDelete?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId?: string
  ) => void;
}

const PopulatedContributionList = React.memo(
  (props: PopulatedContributionListProps): JSX.Element => {
    const {
      scrollParent,
      pitchDocs,
      contributionDocs,
      chunkMap,
      lastLoadedChunk,
      style,
      onChangeScore,
      onKudo,
      onEdit,
      onDelete,
    } = props;

    const contributionEntries = useMemo(
      () => Object.entries(contributionDocs || {}),
      [contributionDocs]
    );
    const contributionChunks = useMemo(() => {
      const chunks: [string, ContributionDocument][][] = [];
      contributionEntries.forEach(([id, doc]) => {
        const chunkIndex = chunkMap?.[id] || 0;
        if (!chunks[chunkIndex]) {
          chunks[chunkIndex] = [];
        }
        chunks[chunkIndex].push([id, doc]);
      });
      return chunks;
    }, [chunkMap, contributionEntries]);

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

    if (!contributionDocs) {
      return null;
    }

    return (
      <StyledPopulatedContributionList style={style}>
        {contributionChunks.map((chunkEntries, chunkIndex) => {
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
              <VirtualizedContributionChunk
                scrollParent={scrollParent}
                pitchDocs={pitchDocs}
                chunkIndex={chunkIndex}
                chunkEntries={chunkEntries}
                chunkNodes={nodesRef.current[chunkIndex]}
                onChangeScore={onChangeScore}
                onDelete={onDelete}
                onKudo={onKudo}
                onEdit={onEdit}
                onEnter={handleEnter}
                onEntered={handleEntered}
                onExit={handleExit}
                onExited={handleExited}
              />
            </VirtualizedItem>
          );
        })}
      </StyledPopulatedContributionList>
    );
  }
);

export default PopulatedContributionList;
