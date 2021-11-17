import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Checkbox from "@material-ui/core/Checkbox";
import Divider from "@material-ui/core/Divider";
import FormControlLabel from "@material-ui/core/FormControlLabel";
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
import { Inspector, removeDuplicates } from "../../../impower-core";
import { MemberAccess, MemberData } from "../../../impower-data-state";
import {
  AccessDocument,
  isProjectDocument,
  PageDocument,
} from "../../../impower-data-store";
import { FontIcon } from "../../../impower-icon";
import { ToastContext, toastLeft } from "../../../impower-toast";
import {
  UserContext,
  userOnChangeMember,
  userOnUpdateSubmission,
} from "../../../impower-user";
import { RenderPropertyProps } from "../inputs/DataField";
import PageMembersField, {
  PageMembersFieldProps,
} from "../inputs/PageMembersField";
import InspectorForm from "./InspectorForm";

const title = "Manage access to";
const updatedMessage = "Updated Access";
const unrestrictedLabel = "All studio members have access";

const propertyPaths = ["members"];
const doneLabel = "Save Changes";
const inviteLabel = "Invite";

const StyledAccessDocumentForm = styled(Paper)`
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

const StyledHeaderTitleArea = styled.div``;

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

const StyledFormControlLabel = styled(FormControlLabel)`
  flex: 1;
  padding: ${(props): string => props.theme.spacing(1, 0)};
`;

const StyledCheckboxTypography = styled(Typography)`
  white-space: nowrap;
`;

export const AccessField = (
  props: RenderPropertyProps & PageMembersFieldProps
): JSX.Element | null => {
  const { propertyPath } = props;
  if (propertyPath === "members") {
    return <PageMembersField {...props} />;
  }
  return null;
};

interface ManageAccessFormProps {
  claimableCollection: "studios" | "projects";
  claimableIds: string[];
  claimableDocs: PageDocument[];
  memberDocs: {
    [id: string]: MemberData;
  };
  doc: AccessDocument;
  allowEdit?: boolean;
  submitting?: boolean;
  onClose?: () => void;
  onSubmit?: (e: React.MouseEvent, doc: AccessDocument) => void;
  onChange?: (doc?: AccessDocument) => void;
  getInspector: (data: Record<string, unknown>) => Inspector;
  onSubmitting?: (submitting: boolean) => void;
}

const ManageAccessForm = React.memo(
  (props: PropsWithChildren<ManageAccessFormProps>): JSX.Element | null => {
    const {
      claimableCollection,
      claimableIds,
      claimableDocs,
      memberDocs,
      doc,
      allowEdit,
      submitting,
      children,
      onClose,
      onSubmit,
      onChange,
      getInspector,
      onSubmitting,
    } = props;

    const [expandedProperties, setExpandedProperties] = useState<string[]>([]);
    const [newAccess, setNewAccess] = useState<MemberAccess>(
      MemberAccess.Editor
    );

    const contentRef = useRef<HTMLDivElement>();
    const latestDoc = useRef(doc);

    const [, toastDispatch] = useContext(ToastContext);
    const [, userDispatch] = useContext(UserContext);

    const theme = useTheme();

    const addingNewMembers = Object.values(
      doc?.changedMembers?.data || {}
    ).some((memberDoc) => Boolean(memberDoc));

    const key = claimableIds?.join(",") || "";

    useEffect(() => {
      setExpandedProperties([]);
      setNewAccess(MemberAccess.Editor);
    }, [key]);

    const doChangeMember = useCallback(
      async (
        docId: string,
        memberId: string,
        memberDoc: MemberData
      ): Promise<void> => {
        if (!memberId || memberId === "null") {
          return;
        }
        const existingMember = memberDocs?.[memberId];
        if (memberDoc) {
          const timestampServerValue = (
            await import(
              "../../../impower-data-state/utils/timestampServerValue"
            )
          ).default;
          await new Promise<void>((resolve) =>
            userDispatch(
              userOnChangeMember(
                resolve,
                {
                  access: memberDoc ? memberDoc.access : newAccess,
                  g: memberDoc.g,
                  role: memberDoc.role,
                  ...(existingMember
                    ? {}
                    : { t: timestampServerValue() as number }),
                },
                claimableCollection,
                docId,
                "members",
                "data",
                memberId
              )
            )
          );
        } else {
          await new Promise<void>((resolve) =>
            userDispatch(
              userOnChangeMember(
                resolve,
                null,
                claimableCollection,
                docId,
                "members",
                "data",
                memberId
              )
            )
          );
        }
      },
      [claimableCollection, memberDocs, newAccess, userDispatch]
    );

    const doUpdateClaimableMembers = useCallback(
      async (newAccessDoc: AccessDocument, docId: string) => {
        if (newAccessDoc?.changedMembers?.data) {
          await Promise.all(
            Object.entries(newAccessDoc.changedMembers?.data)
              .filter(([memberId]) => Boolean(memberId))
              .map(([memberId, memberDoc]) =>
                doChangeMember(docId, memberId, memberDoc)
              )
          );
        }

        if (
          newAccessDoc.restricted !== undefined &&
          typeof newAccessDoc.restricted === "boolean"
        ) {
          await new Promise<void>((resolve) =>
            userDispatch(
              userOnUpdateSubmission(
                resolve,
                {
                  ...(doc as PageDocument),
                  restricted: newAccessDoc.restricted,
                },
                claimableCollection,
                docId
              )
            )
          );
        }
      },
      [claimableCollection, doChangeMember, doc, userDispatch]
    );

    const handleSubmit = useCallback(
      async (e: React.MouseEvent): Promise<void> => {
        e.preventDefault();
        const newDoc = { ...latestDoc.current };
        const starterPromise = Promise.resolve(null);
        // Claimable docs must be changed one at a time so that claims can be validated for each one
        await claimableIds.reduce(
          (p, docId) => p.then(() => doUpdateClaimableMembers(newDoc, docId)),
          starterPromise
        );
        if (onSubmitting) {
          onSubmitting(false);
        }
        if (onSubmit) {
          onSubmit(e, newDoc);
        }
        toastDispatch(toastLeft(updatedMessage));
      },
      [
        claimableIds,
        onSubmitting,
        onSubmit,
        toastDispatch,
        doUpdateClaimableMembers,
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

    const handleChange = useCallback((docs: AccessDocument[]) => {
      latestDoc.current = docs?.[0];
    }, []);

    const handleDebouncedChange = useCallback(
      (docs: AccessDocument[]) => {
        if (onChange) {
          onChange(docs[0]);
        }
      },
      [onChange]
    );

    const handleUnrestrictedChange = useCallback(
      (event, unrestricted: boolean) => {
        if (onChange) {
          onChange({ ...doc, restricted: !unrestricted });
        }
      },
      [doc, onChange]
    );

    const handleGetPropertyDocIds = useCallback(
      () => claimableIds,
      [claimableIds]
    );

    const description = useMemo(() => {
      if (!claimableDocs) {
        return "";
      }
      const names = claimableDocs
        .map((doc) => doc?.name)
        .slice(0, 3)
        .join(", ");
      if (claimableDocs.length > 3) {
        return `${names}\n+${claimableDocs.length - 3} more`;
      }
      return names;
    }, [claimableDocs]);

    const data = useMemo(() => [doc], [doc]);

    const isRestrictedMixed = useMemo(
      () =>
        claimableDocs
          ? removeDuplicates(claimableDocs.map((d) => d.restricted)).length > 1
          : false,
      [claimableDocs]
    );

    const firstClaimableDoc = useMemo(
      () => claimableDocs?.[0],
      [claimableDocs]
    );

    const restricted = useMemo(
      () =>
        isProjectDocument(firstClaimableDoc)
          ? (doc?.restricted as boolean) || false
          : undefined,
      [firstClaimableDoc, doc]
    );

    const hasUnsavedChanges = useMemo(
      () =>
        (doc?.restricted !== undefined &&
          claimableDocs?.some(
            (d) => Boolean(d.restricted) !== Boolean(doc?.restricted)
          )) ||
        Object.keys(doc?.changedMembers?.data || {}).length > 0,
      [claimableDocs, doc]
    );

    if (!doc) {
      return null;
    }

    return (
      <StyledAccessDocumentForm ref={contentRef}>
        <StyledForegroundArea>
          <StyledContentArea style={{ overflow: "hidden" }}>
            <StyledContainer>
              {onClose && (
                <Hidden smUp>
                  <StyledHeader>
                    <StyledHeaderLeftArea>
                      <IconButton disabled={submitting} onClick={onClose}>
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
              </StyledHeaderTitleArea>
              <StyledFormArea>
                <InspectorForm
                  renderProperty={AccessField}
                  renderPropertyProps={{
                    allowEdit,
                    memberDocs,
                    newAccess,
                    onNewAccessChange: setNewAccess,
                  }}
                  getInspector={getInspector}
                  data={data}
                  variant="outlined"
                  InputComponent={OutlinedInput}
                  spacing={16}
                  propertyPaths={propertyPaths}
                  expandedProperties={expandedProperties}
                  submitButtonLabel={
                    addingNewMembers || !allowEdit ? inviteLabel : doneLabel
                  }
                  submitButtonProps={{
                    disabled: !hasUnsavedChanges,
                    alignment: "center",
                    color: hasUnsavedChanges ? "primary" : "inherit",
                  }}
                  onChange={handleChange}
                  onExpandProperty={handleExpandProperty}
                  onDebouncedChange={handleDebouncedChange}
                  onSubmit={handleSubmit}
                  onSubmitting={onSubmitting}
                  getPropertyDocIds={handleGetPropertyDocIds}
                  buttonChildren={
                    restricted !== undefined && !addingNewMembers ? (
                      <StyledFormControlLabel
                        control={
                          <Checkbox
                            color="secondary"
                            size="small"
                            indeterminate={isRestrictedMixed}
                            checked={!restricted}
                            onChange={handleUnrestrictedChange}
                          />
                        }
                        label={
                          <StyledCheckboxTypography variant="body2">
                            {unrestrictedLabel}
                          </StyledCheckboxTypography>
                        }
                      />
                    ) : (
                      <StyledSeparator />
                    )
                  }
                >
                  {children}
                </InspectorForm>
              </StyledFormArea>
            </StyledContainer>
          </StyledContentArea>
        </StyledForegroundArea>
      </StyledAccessDocumentForm>
    );
  }
);

export default ManageAccessForm;
