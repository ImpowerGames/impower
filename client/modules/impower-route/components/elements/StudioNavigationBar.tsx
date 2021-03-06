import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import React, { useCallback, useContext, useEffect, useState } from "react";
import PlusRegularIcon from "../../../../resources/icons/regular/plus.svg";
import UserGroupSolidIcon from "../../../../resources/icons/solid/user-group.svg";
import { ConfigContext } from "../../../impower-config";
import ConfigCache from "../../../impower-config/classes/configCache";
import { StorageFile } from "../../../impower-core";
import { StudioDocument } from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import { DynamicIcon, FontIcon } from "../../../impower-icon";
import { useRouter } from "../../../impower-router";
import { UserContext } from "../../../impower-user";
import { engineConsoles, EngineConsoleType } from "../../types/info/console";
import CreateStudioForm from "../forms/CreateStudioForm";
import StudioCreationFinishedSummary from "../forms/StudioCreationFinishedSummary";
import EditDialog from "../popups/EditDialog";
import EngineNavigationBar from "./EngineNavigationBar";

const StyledButton = styled(Button)`
  border-radius: 50%;
  min-width: ${(props): string => props.theme.spacing(6)};
  min-height: ${(props): string => props.theme.spacing(6)};
  padding: 0;
  border: 2px solid;
  &.MuiButton-outlinedSecondary:hover {
    border: 2px solid;
  }
`;

const StudioNavigationBar = React.memo(() => {
  const [configState] = useContext(ConfigContext);
  const [userState] = useContext(UserContext);
  const { uid, studios } = userState;

  const [createDocId, setCreateDocId] = useState<string>();
  const [createDoc, setCreateDoc] = useState<StudioDocument>();
  const [creating, setCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState<boolean>();
  const [links, setLinks] = useState<
    {
      label: string;
      link: string;
      icon?: React.ReactNode;
      image?: string;
      backgroundColor?: string;
    }[]
  >([]);

  const engineConsole = engineConsoles.find(
    (c) => c.type === EngineConsoleType.Studios
  );

  const { createLabel } = engineConsole;

  const router = useRouter();

  const theme = useTheme();

  const mainTag = createDoc?.tags?.[0] || "";
  const tagIconNames =
    configState?.tagIconNames || ConfigCache.instance.params?.tagIconNames;
  const tagDisambiguations =
    configState?.tagDisambiguations ||
    ConfigCache.instance.params?.tagDisambiguations;
  const validMainTag = tagDisambiguations[mainTag]?.[0] || mainTag;
  const tagIconName = tagIconNames?.[validMainTag] || "hashtag";

  useEffect(() => {
    setLinks(
      studios
        ? [
            ...Object.entries(studios).map(([id, doc]) => ({
              label: doc?.name,
              link: `/e/s/${id}`,
              icon: mainTag ? <DynamicIcon icon={tagIconName} /> : undefined,
              image: doc?.icon.fileUrl,
              backgroundColor: doc?.hex,
            })),
            {
              label: "Shared With You",
              link: `/e/s/shared`,
              icon: <UserGroupSolidIcon />,
              backgroundColor: theme.palette.secondary.main,
            },
          ]
        : undefined
    );
  }, [mainTag, studios, tagIconName, theme]);

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.e !== prevState?.e) {
        setCreateDialogOpen(currState?.e === "studio");
      }
    },
    []
  );
  const [openEditDialog, closeEditDialog] = useDialogNavigation(
    "e",
    handleBrowserNavigation
  );

  const handleCreateStudio = useCallback(async () => {
    const createStudioDocument = (
      await import("../../../impower-data-store/utils/createStudioDocument")
    ).default;
    const newDoc = createStudioDocument({
      _createdBy: uid,
      name: "",
      handle: "",
      owners: [uid],
    });
    setCreateDoc(newDoc);
    setCreateDialogOpen(true);
    openEditDialog("studio");
  }, [openEditDialog, uid]);

  const handleCloseCreateMenu = useCallback(async () => {
    if (!creating) {
      setCreateDialogOpen(false);
      closeEditDialog();
    }
  }, [closeEditDialog, creating]);

  const handleSubmit = useCallback((e: React.MouseEvent, id: string) => {
    setCreateDocId(id);
    setCreating(true);
  }, []);

  const handleSubmitted = useCallback(() => {
    setCreating(false);
  }, []);

  const handleUploadIcon = useCallback(
    (icon: StorageFile) => {
      setCreateDoc({ ...createDoc, icon });
    },
    [createDoc]
  );

  useEffect(() => {
    const { query } = router as { query: { mode?: string } };
    if (query?.mode === "create-studio") {
      handleCreateStudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <>
      <EngineNavigationBar links={links}>
        <StyledButton
          variant="outlined"
          color="secondary"
          onClick={handleCreateStudio}
        >
          <FontIcon aria-label={createLabel} size={theme.fontSize.smallIcon}>
            <PlusRegularIcon />
          </FontIcon>
        </StyledButton>
      </EngineNavigationBar>
      <EditDialog open={createDialogOpen} onClose={handleCloseCreateMenu}>
        <CreateStudioForm
          docId={createDocId}
          doc={createDoc}
          onChange={setCreateDoc}
          onSubmit={handleSubmit}
          onSubmitted={handleSubmitted}
          onClose={handleCloseCreateMenu}
          finishedSummary={
            <StudioCreationFinishedSummary
              docId={createDocId}
              doc={createDoc}
              onUploadIcon={handleUploadIcon}
            />
          }
        />
      </EditDialog>
    </>
  );
});

export default StudioNavigationBar;
