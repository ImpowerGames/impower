import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Divider from "@material-ui/core/Divider";
import Hidden from "@material-ui/core/Hidden";
import IconButton from "@material-ui/core/IconButton";
import OutlinedInput from "@material-ui/core/OutlinedInput";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import React, {
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import XmarkSolidIcon from "../../../../resources/icons/solid/xmark.svg";
import {
  MemberAccess,
  MemberData,
  MemberDataInspector,
} from "../../../impower-data-state";
import { FontIcon } from "../../../impower-icon";
import { ToastContext, toastLeft } from "../../../impower-toast";
import { UserContext, userOnChangeMember } from "../../../impower-user";
import AutocompleteInput from "../inputs/AutocompleteInput";
import StringInput from "../inputs/StringInput";
import InspectorForm from "./InspectorForm";

const title = "Edit member";
const updatedMessage = "Edited member";
const deletedMessage = "Removed member";
const onlyOwnerInfo =
  "To remove or change your access level, first add another owner to the studio.";

const doneLabel = "Save Changes";
const deleteLabel = "Remove Member";

const StyledEditMemberDocumentForm = styled(Paper)`
  position: relative;
  flex: 1;
  display: flex;
  ${(props): string => props.theme.breakpoints.down("md")} {
    box-shadow: none;
    border-radius: 0;
  }
`;

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  ${(props): string => props.theme.breakpoints.down("md")} {
    height: 100%;
  }
  padding: ${(props): string => props.theme.spacing(2)};
  max-width: 100%;
  width: ${(props): string => props.theme.spacing(60)};
  margin: auto;
`;

const StyledHeader = styled.div`
  width: 100%;
  display: flex;
  align-items: flex-start;
`;

const StyledHeaderLeftArea = styled.div`
  flex: 1;
  display: flex;
  min-width: ${(props): string => props.theme.spacing(5)};
`;

const StyledHeaderRightArea = styled.div`
  flex: 1;
  display: flex;
  justify-content: flex-end;
  min-width: ${(props): string => props.theme.spacing(5)};
`;

const StyledHeaderTitleArea = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
`;

const StyledTitleTypography = styled(Typography)`
  text-align: center;
  font-weight: ${(props): number => props.theme.fontWeight.bold};

  padding-top: ${(props): string => props.theme.spacing(1)};
`;

const StyledDescriptionTypography = styled(Typography)`
  opacity: 0.7;
  text-align: center;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};

  padding-top: ${(props): string => props.theme.spacing(1)};
  padding-bottom: ${(props): string => props.theme.spacing(2)};
  white-space: pre-wrap;
`;

const StyledInfoTypography = styled(Typography)`
  opacity: 0.7;
  text-align: center;

  padding-top: ${(props): string => props.theme.spacing(2)};
  padding-bottom: ${(props): string => props.theme.spacing(2)};
`;

const StyledForegroundArea = styled.div`
  flex: 2;
  display: flex;
  flex-direction: column;
`;

const StyledContentArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
`;

const StyledFormArea = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledSeparator = styled.div`
  flex: 1;
`;

const StyledButton = styled(Button)``;

interface EditMemberFormProps {
  uid: string;
  access: MemberAccess;
  claimableCollection: "studios" | "projects";
  claimableId: string;
  docId: string;
  doc: MemberData;
  ownerCount: number;
  onClose?: () => void;
  onSubmit?: () => void;
  onDelete?: () => void;
  onChange?: (doc?: MemberData) => void;
}

const EditMemberForm = React.memo(
  (props: PropsWithChildren<EditMemberFormProps>): JSX.Element | null => {
    const {
      uid,
      access,
      claimableCollection,
      claimableId,
      docId,
      doc,
      ownerCount,
      children,
      onClose,
      onSubmit,
      onDelete,
      onChange,
    } = props;

    const [originalDoc, setOriginalDoc] = useState({ ...doc });
    const [editing, setEditing] = useState(false);

    const [expandedProperties, setExpandedProperties] = useState<string[]>([]);
    const [, toastDispatch] = useContext(ToastContext);
    const [, userDispatch] = useContext(UserContext);

    const contentRef = useRef<HTMLDivElement>();
    const latestDoc = useRef(doc);

    useEffect(() => {
      setEditing(false);
      setOriginalDoc({ ...doc });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docId]);

    const theme = useTheme();

    const handleSubmit = useCallback(
      async (e: React.MouseEvent) => {
        e.preventDefault();
        setEditing(true);

        const newDoc = { ...latestDoc.current };

        const group = claimableCollection;

        await new Promise<void>((resolve) =>
          userDispatch(
            userOnChangeMember(
              resolve,
              {
                access: newDoc.access,
                role: newDoc.role,
                g: group,
              },
              claimableCollection,
              claimableId,
              "members",
              "data",
              docId
            )
          )
        );

        if (onSubmit) {
          onSubmit();
        }

        toastDispatch(toastLeft(updatedMessage));

        setEditing(false);
      },
      [
        claimableCollection,
        claimableId,
        docId,
        onSubmit,
        toastDispatch,
        userDispatch,
      ]
    );

    const handleDelete = useCallback(
      async (e: React.MouseEvent): Promise<void> => {
        e.preventDefault();
        setEditing(true);

        await new Promise<void>((resolve) =>
          userDispatch(
            userOnChangeMember(
              resolve,
              null,
              claimableCollection,
              claimableId,
              "members",
              "data",
              docId
            )
          )
        );

        if (onDelete) {
          onDelete();
        }

        toastDispatch(toastLeft(deletedMessage));

        setEditing(false);
      },
      [
        claimableCollection,
        claimableId,
        docId,
        onDelete,
        toastDispatch,
        userDispatch,
      ]
    );

    const handleExpandProperty = useCallback(
      (propertyPath, expanded): void => {
        if (expanded && !expandedProperties.includes(propertyPath)) {
          setExpandedProperties([...expandedProperties, propertyPath]);
        } else if (!expanded && expandedProperties.includes(propertyPath)) {
          setExpandedProperties(
            expandedProperties.filter((p): boolean => p !== propertyPath)
          );
        }
      },
      [expandedProperties]
    );

    const handleChange = useCallback((docs: MemberData[]) => {
      latestDoc.current = docs?.[0];
    }, []);

    const handleDebouncedChange = useCallback(
      (docs: MemberData[]) => {
        if (onChange) {
          onChange(docs[0]);
        }
      },
      [onChange]
    );

    const handleGetPropertyDocIds = useCallback(
      () => [claimableId],
      [claimableId]
    );

    const description = useMemo(() => {
      if (!doc?.a?.u) {
        return "";
      }
      return doc?.a?.u;
    }, [doc]);

    const data = useMemo(() => [doc], [doc]);

    const hasUnsavedChanges = useMemo(
      () =>
        originalDoc?.access !== doc?.access || originalDoc?.role !== doc?.role,
      [doc, originalDoc]
    );

    const handleGetDocumentInspector = useCallback(() => {
      return MemberDataInspector.instance;
    }, []);

    const isOwner = access === MemberAccess.Owner;

    const isEditingOnlyOwner = isOwner && ownerCount === 1 && docId === uid;

    const canDelete = useMemo(
      () => isOwner && !isEditingOnlyOwner,
      [isEditingOnlyOwner, isOwner]
    );

    const propertyPaths = useMemo(
      () => (isOwner && !isEditingOnlyOwner ? ["access", "role"] : ["role"]),
      [isEditingOnlyOwner, isOwner]
    );

    if (!doc) {
      return null;
    }

    return (
      <StyledEditMemberDocumentForm ref={contentRef}>
        <StyledForegroundArea>
          <StyledContentArea style={{ overflow: "hidden" }}>
            <StyledContainer>
              {onClose && (
                <Hidden smUp>
                  <StyledHeader>
                    <StyledHeaderLeftArea>
                      <IconButton disabled={editing} onClick={onClose}>
                        <FontIcon
                          aria-label="Back"
                          color={theme.palette.primary.light}
                          size={24}
                        >
                          <XmarkSolidIcon />
                        </FontIcon>
                      </IconButton>
                    </StyledHeaderLeftArea>
                    <StyledHeaderRightArea />
                  </StyledHeader>
                </Hidden>
              )}
              <StyledHeaderTitleArea>
                {title && (
                  <StyledTitleTypography variant="h5">
                    {title}
                  </StyledTitleTypography>
                )}
                {description && (
                  <StyledDescriptionTypography variant="body1">
                    {description}
                  </StyledDescriptionTypography>
                )}
                <Divider />
                {isEditingOnlyOwner && onlyOwnerInfo && (
                  <StyledInfoTypography variant="caption">
                    {onlyOwnerInfo}
                  </StyledInfoTypography>
                )}
              </StyledHeaderTitleArea>
              <StyledFormArea>
                <InspectorForm
                  getInspector={handleGetDocumentInspector}
                  data={data}
                  variant="outlined"
                  InputComponent={OutlinedInput}
                  StringInputComponent={StringInput}
                  AutocompleteInputComponent={AutocompleteInput}
                  spacing={16}
                  propertyPaths={propertyPaths}
                  expandedProperties={expandedProperties}
                  submitButtonLabel={doneLabel}
                  submitButtonProps={{
                    disabled: !hasUnsavedChanges,
                    alignment: "space-between",
                    color: hasUnsavedChanges ? "primary" : "inherit",
                  }}
                  disabled={editing}
                  submitting={editing}
                  onExpandProperty={handleExpandProperty}
                  onChange={handleChange}
                  onDebouncedChange={handleDebouncedChange}
                  onSubmit={handleSubmit}
                  onSubmitting={setEditing}
                  getPropertyDocIds={handleGetPropertyDocIds}
                  buttonChildren={
                    <>
                      {canDelete && (
                        <StyledButton
                          size="large"
                          variant="outlined"
                          onClick={handleDelete}
                        >
                          {deleteLabel}
                        </StyledButton>
                      )}
                      <StyledSeparator />
                    </>
                  }
                >
                  {children}
                </InspectorForm>
              </StyledFormArea>
            </StyledContainer>
          </StyledContentArea>
        </StyledForegroundArea>
      </StyledEditMemberDocumentForm>
    );
  }
);

export default EditMemberForm;
