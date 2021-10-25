import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { useMediaQuery } from "@material-ui/core";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import UserTrashCanRegularIcon from "../../../../resources/icons/regular/trash-can.svg";
import UserRegularIcon from "../../../../resources/icons/regular/user.svg";
import IllustrationImage from "../../../../resources/illustrations/clip-working-from-home-2.svg";
import { abbreviateAge } from "../../../impower-config";
import format from "../../../impower-config/utils/format";
import {
  MemberAccess,
  MemberData,
  useCollectionData,
} from "../../../impower-data-state";
import {
  AccessDocument,
  StudioDocument,
  StudioDocumentInspector,
} from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import Illustration from "../../../impower-route-home/components/elements/Illustration";
import EditMemberForm from "../../../impower-route/components/forms/EditMemberForm";
import ManageAccessForm from "../../../impower-route/components/forms/ManageAccessForm";
import EditDialog from "../../../impower-route/components/popups/EditDialog";
import {
  EngineConsoleType,
  studioConsoles,
} from "../../../impower-route/types/info/console";
import { useRouter } from "../../../impower-router";
import { UserContext, userOnChangeMember } from "../../../impower-user";
import EngineConsoleList, { CardDetail } from "../lists/EngineConsoleList";

interface MembersConsoleContentProps {
  scrollParent?: HTMLElement;
  uid: string;
  studioId: string;
  ownerCount: number;
  loading?: boolean;
  cardDetails: { [key: string]: CardDetail };
  memberDocs?: { [id: string]: MemberData };
  studioMemberDoc?: MemberData;
  createLabel: string;
  addLabel: string;
  selectedLabel: string;
  editMultipleLabel: string;
  contextLabel: string;
  searchLabel: string;
  clearLabel: string;
  sortLabel: string;
  filterLabel: string;
  footerLabel?: string;
  noneLabel?: string;
  backLabel?: string;
  doneLabel?: string;
  deleteLabel?: string;
  emptyBackground: React.ReactNode;
  fixedStyle?: React.CSSProperties;
  stickyStyle?: {
    position?: string;
    zIndex?: number;
    boxShadow?: string;
    top?: number;
    left?: number;
    right?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
  };
  onAdd?: () => void;
  onDelete?: (ids: string[]) => void;
  onClick?: (e: React.MouseEvent, id: string) => void;
}

const MembersConsoleContent = (
  props: MembersConsoleContentProps
): JSX.Element | null => {
  const {
    scrollParent,
    uid,
    ownerCount,
    loading,
    cardDetails,
    memberDocs,
    studioMemberDoc,
    createLabel,
    addLabel,
    selectedLabel,
    editMultipleLabel,
    contextLabel,
    searchLabel,
    clearLabel,
    sortLabel,
    filterLabel,
    footerLabel,
    noneLabel,
    backLabel,
    doneLabel,
    emptyBackground,
    stickyStyle,
    fixedStyle,
    onAdd,
    onDelete,
    onClick,
  } = props;

  const ids = useMemo(
    () => (memberDocs ? Object.keys(memberDocs) : undefined),
    [memberDocs]
  );

  const canDelete = useCallback(
    (id: string) =>
      studioMemberDoc?.access === MemberAccess.Owner &&
      (memberDocs?.[id]?.access !== MemberAccess.Owner || ownerCount > 1),
    [memberDocs, ownerCount, studioMemberDoc?.access]
  );

  const getRowImage = useCallback(
    (id: string) => {
      const memberDoc = memberDocs?.[id];
      if (memberDoc) {
        return memberDoc.a.i;
      }
      return "";
    },
    [memberDocs]
  );
  const getRowIcon = useCallback(() => {
    return <UserRegularIcon />;
  }, []);
  const getRowColor = useCallback(
    (id: string) => {
      const memberDoc = memberDocs?.[id];
      if (memberDoc) {
        return memberDoc.a.h;
      }
      return "";
    },
    [memberDocs]
  );
  const getRowMoreOptions = useCallback(
    (id: string): string[] => {
      const deleteOptions = canDelete(id) ? ["Remove"] : [];
      return [...deleteOptions];
    },
    [canDelete]
  );
  const getOptionIcon = useCallback((option: string) => {
    if (option === "Remove") {
      return <UserTrashCanRegularIcon />;
    }
    return undefined;
  }, []);

  const handleDelete = useCallback(
    async (ids: string[]) => {
      if (onDelete) {
        onDelete(ids);
      }
    },
    [onDelete]
  );

  const handleMore = useCallback(
    (event: React.MouseEvent, id: string, option: string) => {
      event.preventDefault();
      event.stopPropagation();
      const doc = memberDocs?.[id];
      if (doc) {
        if (option === "Edit") {
          onClick(event, id);
        }
        if (option === "Remove") {
          handleDelete([id]);
        }
      }
    },
    [memberDocs, onClick, handleDelete]
  );

  const getCellDisplayValue = useCallback(
    (id: string, key: string): string => {
      const doc = memberDocs?.[id];
      if (doc) {
        if (key === "name") {
          const memberDoc = memberDocs?.[id];
          if (memberDoc) {
            if (id === uid) {
              return `(You) ${memberDoc.a?.u}`;
            }
            return memberDoc.a?.u;
          }
        }
        if (key === "access") {
          if (doc.access === MemberAccess.Owner) {
            return "Owner";
          }
          if (doc.access === MemberAccess.Editor) {
            return "Editor";
          }
          if (doc.access === MemberAccess.Viewer) {
            return "Viewer";
          }
          return doc.access;
        }
        if (key === "role") {
          return doc.role;
        }
        if (key === "modified") {
          if (doc?.t) {
            const createdAt = doc?.t;
            return format("Added {date}", {
              date: abbreviateAge(new Date(createdAt)),
            });
          }
          return "";
        }
        const value = doc[key];
        return (value as string) || "";
      }
      return "";
    },
    [memberDocs, uid]
  );
  const getCellSortValue = useCallback(
    (id: string, key: string) => {
      const doc = memberDocs?.[id];
      if (doc) {
        if (key === "modified") {
          return doc?.t;
        }
      }
      return getCellDisplayValue(id, key);
    },
    [memberDocs, getCellDisplayValue]
  );

  const handleIsContextAllowed = useCallback(
    (id: string): boolean => {
      return canDelete(id);
    },
    [canDelete]
  );

  const theme = useTheme();

  const belowBreakpoint = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <>
      <EngineConsoleList
        maxWidth={960}
        scrollParent={scrollParent}
        loading={loading}
        paths={ids}
        cardDetails={cardDetails}
        rowNameKey="name"
        getRowImage={getRowImage}
        getRowIcon={getRowIcon}
        getRowColor={getRowColor}
        getRowMoreOptions={getRowMoreOptions}
        getOptionIcon={getOptionIcon}
        getCellDisplayValue={getCellDisplayValue}
        getCellSortValue={getCellSortValue}
        createLabel={createLabel}
        addLabel={addLabel}
        contextOptions={[contextLabel]}
        searchLabel={searchLabel}
        editMultipleLabel={editMultipleLabel}
        selectedLabel={selectedLabel}
        backLabel={backLabel}
        doneLabel={doneLabel}
        clearLabel={clearLabel}
        noneLabel={noneLabel}
        sortLabel={sortLabel}
        filterLabel={filterLabel}
        footerLabel={footerLabel}
        emptyBackground={emptyBackground}
        stickyStyle={stickyStyle}
        fixedStyle={fixedStyle}
        belowBreakpoint={belowBreakpoint}
        onAdd={onAdd}
        onClickContextOption={handleDelete}
        onClick={onClick}
        onMore={handleMore}
        isContextAllowed={handleIsContextAllowed}
      />
    </>
  );
};

const StyledConsoleContentArea = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
`;

interface MembersConsoleProps {
  scrollParent?: HTMLElement;
  studioId: string;
  fixedStyle?: React.CSSProperties;
  stickyStyle?: {
    position?: string;
    zIndex?: number;
    boxShadow?: string;
    top?: number;
    left?: number;
    right?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
  };
}

const MembersConsole = (props: MembersConsoleProps): JSX.Element => {
  const { scrollParent, studioId, stickyStyle, fixedStyle } = props;

  const engineConsole = studioConsoles.find(
    (c) => c.type === EngineConsoleType.Members
  );
  const {
    createLabel,
    addLabel,
    contextLabel,
    searchLabel,
    editMultipleLabel,
    selectedLabel,
    clearLabel,
    noneLabel,
    sortLabel,
    filterLabel,
    backLabel,
    doneLabel,
  } = engineConsole;

  const [userState, userDispatch] = useContext(UserContext);
  const { uid, my_studio_memberships, studios } = userState;
  const router = useRouter();

  const [editDialogOpenKey, setEditDialogOpenKey] = useState<
    "access" | "member"
  >();
  const [editDoc, setEditDoc] = useState<MemberData>();
  const [editDocId, setEditDocId] = useState<string>();
  const [accessDoc, setAccessDoc] = useState<AccessDocument>();
  const memberDocsRef = useRef<{
    [id: string]: MemberData;
  }>({});
  const [memberDocs, setMemberDocs] = useState<{
    [id: string]: MemberData;
  }>();

  const accessDialogOpen = editDialogOpenKey === "access";
  const editDialogOpen = editDialogOpenKey === "member";

  const studioMemberDoc = useMemo(() => {
    if (my_studio_memberships === undefined) {
      return undefined;
    }
    if (my_studio_memberships === null) {
      return null;
    }
    return my_studio_memberships[studioId];
  }, [studioId, my_studio_memberships]);

  const initialMemberDocs = useCollectionData<MemberData>(
    {
      orderByChild: "t",
    },
    "studios",
    studioId,
    "members",
    "data"
  );

  const studioDoc = useMemo<StudioDocument>(
    () => studios?.[studioId],
    [studios, studioId]
  );

  const claimableIds = useMemo<string[]>(() => [studioId], [studioId]);
  const claimableDocs = useMemo<StudioDocument[]>(
    () => [studioDoc],
    [studioDoc]
  );

  const ownerCount = useMemo(
    () =>
      memberDocs
        ? Object.values(memberDocs).filter(
            (d) => d?.access === MemberAccess.Owner
          ).length
        : 0,
    [memberDocs]
  );

  useEffect(() => {
    if (initialMemberDocs) {
      setMemberDocs({ ...initialMemberDocs });
    }
  }, [initialMemberDocs]);

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.e !== prevState?.e) {
        setEditDialogOpenKey((currState.e as "access" | "member") || null);
      }
    },
    []
  );
  const [openEditDialog, closeEditDialog] = useDialogNavigation(
    "e",
    handleBrowserNavigation
  );

  const handleAddAccess = useCallback(async () => {
    const createAccessDocument = (
      await import("../../../impower-data-store/utils/createAccessDocument")
    ).default;
    setAccessDoc(
      createAccessDocument({
        _documentType: "StudioDocument",
        studio: studioId,
      })
    );
    setEditDialogOpenKey("access");
    openEditDialog("access");
  }, [openEditDialog, studioId]);

  const handleClick = useCallback(
    async (e: React.MouseEvent, id: string) => {
      const doc = memberDocs?.[id];
      const canEdit =
        studioMemberDoc?.access === MemberAccess.Owner || id === uid;
      if (doc && canEdit) {
        setEditDocId(id);
        setEditDoc(doc);
        setEditDialogOpenKey("member");
        openEditDialog("member");
      }
    },
    [memberDocs, studioMemberDoc?.access, uid, openEditDialog]
  );

  const handleCloseEditMenu = useCallback(() => {
    setEditDialogOpenKey(null);
    closeEditDialog();
  }, [closeEditDialog]);

  const handleCloseAccessMenu = useCallback(() => {
    setEditDialogOpenKey(null);
    closeEditDialog();
  }, [closeEditDialog]);

  useEffect(() => {
    const { query } = router as { query: { mode?: string } };
    if (query?.mode === "create") {
      handleAddAccess();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const memberCount = memberDocs ? Object.keys(memberDocs).length : 0;
  const canAdd = studioDoc.access === MemberAccess.Owner;
  const footerLabel = `${memberCount} members`;

  const cardDetails = useMemo(
    () => ({
      name: {
        label: "Name",
        displayed: true,
        searchable: true,
        sortable: true,
      },
      access: {
        label: "Access",
        displayed: true,
        filterable: {
          "All Users": "",
          "Owner": MemberAccess.Owner,
          "Editor": MemberAccess.Editor,
          "Viewer": MemberAccess.Viewer,
        },
        sortable: true,
      },
      role: {
        label: "Role",
        displayed: true,
        searchable: true,
        sortable: true,
      },
    }),
    []
  );

  const handleSubmitMember = useCallback(async (): Promise<void> => {
    memberDocsRef.current[editDocId] = editDoc;
    setMemberDocs({ ...memberDocsRef.current });
    setEditDialogOpenKey(null);
    closeEditDialog();
  }, [closeEditDialog, editDoc, editDocId]);

  const handleDeleteMember = useCallback(async (): Promise<void> => {
    if (memberDocsRef.current[editDocId]) {
      delete memberDocsRef.current[editDocId];
    }
    setMemberDocs({ ...memberDocsRef.current });
    setEditDialogOpenKey(null);
    closeEditDialog();
  }, [closeEditDialog, editDocId]);

  const handleDelete = useCallback(
    async (ids: string[]) => {
      ids.forEach((id) => {
        if (memberDocsRef.current[id]) {
          delete memberDocsRef.current[id];
        }
      });
      setMemberDocs({ ...memberDocsRef.current });
      await Promise.all(
        ids.map(
          (memberId) =>
            new Promise<void>((resolve) =>
              userDispatch(
                userOnChangeMember(
                  resolve,
                  null,
                  "studios",
                  studioId,
                  "members",
                  "data",
                  memberId
                )
              )
            )
        )
      );
    },
    [studioId, userDispatch]
  );

  const handleSubmitAccessMenu = useCallback(
    (e: React.MouseEvent, doc: AccessDocument) => {
      Object.entries(doc?.changedMembers?.data || {}).forEach(
        ([memberId, memberDoc]) => {
          if (memberDoc) {
            memberDocsRef.current[memberId] = memberDoc;
          } else if (memberDocsRef.current[memberId]) {
            delete memberDocsRef.current[memberId];
          }
        }
      );
      setMemberDocs({ ...memberDocsRef.current });
      setEditDialogOpenKey(null);
      closeEditDialog();
    },
    [closeEditDialog]
  );

  const handleGetAccessDocumentInspector = useCallback(() => {
    return StudioDocumentInspector.instance;
  }, []);

  return (
    <>
      <StyledConsoleContentArea>
        <MembersConsoleContent
          scrollParent={scrollParent}
          uid={uid}
          studioId={studioId}
          ownerCount={ownerCount}
          loading={!memberDocs}
          cardDetails={cardDetails}
          memberDocs={memberDocs}
          studioMemberDoc={studioMemberDoc}
          createLabel={createLabel}
          addLabel={addLabel}
          selectedLabel={selectedLabel}
          editMultipleLabel={editMultipleLabel}
          contextLabel={contextLabel}
          searchLabel={searchLabel}
          clearLabel={clearLabel}
          sortLabel={sortLabel}
          filterLabel={filterLabel}
          footerLabel={footerLabel}
          noneLabel={noneLabel}
          backLabel={backLabel}
          doneLabel={doneLabel}
          emptyBackground={
            <Illustration
              imageStyle={{
                width: "100%",
                height: "60vh",
              }}
            >
              <IllustrationImage />
            </Illustration>
          }
          stickyStyle={stickyStyle}
          fixedStyle={fixedStyle}
          onAdd={canAdd ? handleAddAccess : undefined}
          onClick={handleClick}
          onDelete={handleDelete}
        />
      </StyledConsoleContentArea>
      <EditDialog open={editDialogOpen} onClose={handleCloseEditMenu}>
        <EditMemberForm
          uid={uid}
          access={studioMemberDoc?.access}
          claimableCollection="studios"
          claimableId={studioId}
          docId={editDocId}
          doc={editDoc}
          ownerCount={ownerCount}
          onChange={setEditDoc}
          onClose={handleCloseEditMenu}
          onSubmit={handleSubmitMember}
          onDelete={handleDeleteMember}
        />
      </EditDialog>
      <EditDialog open={accessDialogOpen} onClose={handleCloseAccessMenu}>
        <ManageAccessForm
          claimableCollection="studios"
          claimableIds={claimableIds}
          claimableDocs={claimableDocs}
          memberDocs={memberDocs}
          doc={accessDoc}
          onChange={setAccessDoc}
          onSubmit={handleSubmitAccessMenu}
          getInspector={handleGetAccessDocumentInspector}
          onClose={handleCloseAccessMenu}
        />
      </EditDialog>
    </>
  );
};

export default MembersConsole;
