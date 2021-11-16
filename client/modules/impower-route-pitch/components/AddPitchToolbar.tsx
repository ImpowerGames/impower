import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PencilSolidIcon from "../../../resources/icons/solid/pencil.svg";
import { ConfigParameters } from "../../impower-config";
import {
  ConfirmDialogContext,
  confirmDialogNavOpen,
} from "../../impower-confirm-dialog";
import { Timestamp } from "../../impower-core";
import { GameDocument } from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import { FontIcon, SvgData } from "../../impower-icon";
import CornerFab from "../../impower-route-engine/components/fabs/CornerFab";
import { useRouter } from "../../impower-router";
import { UserContext } from "../../impower-user";

const createPitchLabel = "Pitch A Game";

const StyledAddPitchToolbarArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
  transition: opacity 0.15s ease;
`;

const StyledScrollSentinel = styled.div`
  pointer-events: none;
  position: absolute;
  top: 0px;
  left: 0;
  width: 1px;
  height: 1px;
`;

const CreatePitchDialog = dynamic(() => import("./CreatePitchDialog"), {
  ssr: false,
});

const discardInfo = {
  title: "Discard unsaved changes?",
  agreeLabel: "Discard",
  disagreeLabel: "Keep Editing",
};

interface AddPitchToolbarProps {
  toolbarRef?: React.Ref<HTMLDivElement>;
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  hidden?: boolean;
}

const AddPitchToolbar = React.memo(
  (props: AddPitchToolbarProps): JSX.Element => {
    const { toolbarRef, config, icons, hidden } = props;

    const [scrollSentinel, setScrollSentinel] = useState<HTMLElement>();

    const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
    const [userState] = useContext(UserContext);
    const { uid } = userState;

    const [canClose, setCanClose] = useState(true);
    const [newDocId, setNewDocId] = useState<string>();
    const [createDoc, setCreateDoc] = useState<GameDocument>();
    const [createDialogOpenKey, setCreateDialogOpenKey] = useState<"game">();
    const [hiddenState, setHiddenState] = useState(true);

    const openedWithQueryRef = useRef(false);

    const createDialogOpen = createDialogOpenKey === "game";

    const router = useRouter();

    useEffect(() => {
      window.requestAnimationFrame(() => {
        setHiddenState(hidden);
      });
    }, [hidden]);

    const handleStartCreation = useCallback(async () => {
      setCanClose(true);
      const Auth = (await import("../../impower-auth/classes/auth")).default;
      const createGameDocument = (
        await import("../../impower-data-store/utils/createGameDocument")
      ).default;
      const newGame = createGameDocument({
        _createdBy: uid,
        _author: Auth.instance.author,
        name: "",
        slug: "",
        owners: [uid],
        pitched: true,
        pitchedAt: new Timestamp(),
      });
      setCreateDoc(newGame);
      setCreateDialogOpenKey("game");
    }, [uid]);

    const createDocExists = Boolean(createDoc);

    const handleEndCreation = useCallback(
      (
        reason:
          | "backdropClick"
          | "escapeKeyDown"
          | "closeButtonClick"
          | "submitted"
          | "browserBack",
        onClose?: () => void
      ) => {
        if (!canClose) {
          return;
        }
        if (reason === "submitted") {
          return;
        }
        const onDiscardChanges = (): void => {
          setCreateDialogOpenKey(null);
          if (onClose) {
            onClose();
          }
        };
        const onKeepEditing = (): void => {
          if (reason === "browserBack") {
            window.setTimeout(() => {
              // eslint-disable-next-line @typescript-eslint/no-use-before-define
              openEditDialog("game");
            }, 200);
          }
        };
        const hasUnsavedChanges =
          createDoc &&
          (createDoc.name !== "" ||
            createDoc.summary !== "" ||
            JSON.stringify(createDoc.tags) !== JSON.stringify([]));
        if (hasUnsavedChanges) {
          confirmDialogDispatch(
            confirmDialogNavOpen(
              discardInfo.title,
              undefined,
              discardInfo.agreeLabel,
              onDiscardChanges,
              discardInfo.disagreeLabel,
              onKeepEditing
            )
          );
        } else {
          onDiscardChanges();
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [canClose, confirmDialogDispatch, createDoc]
    );

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.e !== prevState?.e) {
          if (currState?.e === "game") {
            if (!createDocExists) {
              handleStartCreation();
            }
          } else {
            handleEndCreation("browserBack");
          }
        }
      },
      [createDocExists, handleEndCreation, handleStartCreation]
    );
    const [openEditDialog, closeEditDialog] = useDialogNavigation(
      "e",
      handleBrowserNavigation
    );

    const handleOpenCreateDialog = useCallback((): void => {
      handleStartCreation();
      openEditDialog("game");
    }, [handleStartCreation, openEditDialog]);

    const handleCloseCreateDialog = useCallback(
      (
        e: React.MouseEvent,
        reason:
          | "backdropClick"
          | "escapeKeyDown"
          | "closeButtonClick"
          | "submitted"
      ): void => {
        if (openedWithQueryRef.current) {
          handleEndCreation(reason, () => {
            const newState = { ...(window.history.state || {}) };
            delete newState.query;
            window.history.replaceState(newState, "", "/pitch");
          });
        } else {
          handleEndCreation(reason, closeEditDialog);
        }
      },
      [closeEditDialog, handleEndCreation]
    );

    const handleSubmit = useCallback(
      async (e: React.MouseEvent, id: string) => {
        setNewDocId(id);
        setCanClose(false);
      },
      []
    );

    const handleSubmitted = useCallback(
      async (id: string, doc: GameDocument, successful: boolean) => {
        if (successful) {
          await router.replace(`/p/${id}`);
        }
        setCanClose(true);
      },
      [router]
    );

    useEffect(() => {
      if (router.isReady) {
        if (window.location.search?.toLowerCase() === "?e=game") {
          openedWithQueryRef.current = true;
          if (!createDocExists) {
            handleStartCreation();
          }
        }
      }
    }, [createDocExists, handleStartCreation, router]);

    const handleScrollSentinelRef = useCallback((instance: HTMLDivElement) => {
      if (instance) {
        setScrollSentinel(instance);
      }
    }, []);

    const theme = useTheme();

    const fabMaxWidth = theme.breakpoints.values.sm;

    const fabSpacing = theme.spacing(3);

    const fabStyle: React.CSSProperties = useMemo(
      () => ({
        position: "fixed",
        left: fabSpacing,
        right: fabSpacing,
        bottom: fabSpacing,
        maxWidth: fabMaxWidth,
        margin: "auto",
        transition: "opacity 0.15s ease",
        opacity: hiddenState ? 0 : 1,
      }),
      [fabMaxWidth, fabSpacing, hiddenState]
    );

    const icon = useMemo(
      () => (
        <FontIcon aria-label={createPitchLabel} size={15}>
          <PencilSolidIcon />
        </FontIcon>
      ),
      []
    );
    return (
      <>
        <StyledScrollSentinel ref={handleScrollSentinelRef} />
        <StyledAddPitchToolbarArea id="add-pitch-toolbar" ref={toolbarRef}>
          <CornerFab
            icon={icon}
            label={createPitchLabel}
            color="primary"
            scrollSentinel={scrollSentinel}
            onClick={handleOpenCreateDialog}
            style={fabStyle}
          />
          {createDialogOpenKey !== undefined && (
            <CreatePitchDialog
              config={config}
              icons={icons}
              open={createDialogOpen}
              id={newDocId}
              doc={createDoc}
              onClose={handleCloseCreateDialog}
              onChange={setCreateDoc}
              onSubmit={handleSubmit}
              onSubmitted={handleSubmitted}
            />
          )}
        </StyledAddPitchToolbarArea>
      </>
    );
  }
);

export default AddPitchToolbar;
