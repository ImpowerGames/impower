import styled from "@emotion/styled";
import FilledInput from "@mui/material/FilledInput";
import React, { useCallback, useContext, useMemo } from "react";
import { difference } from "../../../impower-core";
import { MemberAccess, MemberData } from "../../../impower-data-state";
import {
  AccessDocument,
  isProjectDocument,
  isStudioDocument,
  StudioDocument,
  UserDocument,
} from "../../../impower-data-store";
import { VirtualizedItem } from "../../../impower-react-virtualization";
import { UserContext } from "../../../impower-user";
import AccessDocInput from "./AccessDocInput";
import { RenderPropertyProps } from "./DataField";
import MemberAccessInput from "./MemberAccessInput";

const StyledMembersArea = styled.div`
  flex: 1;
  position: relative;
  overflow-y: auto;
  margin: ${(props): string => props.theme.spacing(0, -1)};
`;

const StyledMembersContent = styled.div`
  padding: ${(props): string => props.theme.spacing(0, 1)};
`;

export interface PageMembersFieldProps extends RenderPropertyProps {
  data: Record<string, unknown>[];
  memberDocs?: {
    [id: string]: MemberData;
  };
  creating?: boolean;
  allowEdit?: boolean;
  newAccess?: MemberAccess;
  onNewAccessChange?: (uid: string, access: MemberAccess) => void;
}

export const PageMembersField = (
  props: PageMembersFieldProps
): JSX.Element | null => {
  const {
    data,
    memberDocs,
    variant,
    InputComponent,
    size,
    backgroundColor,
    disabled,
    label,
    placeholder,
    propertyPath,
    spacing,
    debounceInterval,
    creating,
    allowEdit,
    newAccess,
    getInspector,
    onPropertyInputChange,
    onPropertyChange,
    onDebouncedPropertyChange,
    onNewAccessChange,
  } = props;

  const [userState] = useContext(UserContext);
  const { uid } = userState;

  const doc = data[0] as AccessDocument;

  const existingMemberAccessIds = useMemo(
    () =>
      Object.entries(memberDocs || {})
        .filter(([, doc]) => Boolean(doc))
        .map(([id]) => id),
    [memberDocs]
  );

  const changedMemberAccessIds = useMemo(
    () => Object.entries(doc?.changedMembers?.data || {}).map(([id]) => id),
    [doc]
  );

  const updatedMemberAccessIds = useMemo(
    () =>
      Object.entries(doc?.changedMembers?.data || {})
        .filter(([, doc]) => Boolean(doc))
        .map(([id]) => id),
    [doc]
  );

  const newMemberAccessIds = useMemo(
    () => difference(updatedMemberAccessIds, existingMemberAccessIds),
    [existingMemberAccessIds, updatedMemberAccessIds]
  );

  const excludeMemberIdsFromSearch = useMemo(
    () => existingMemberAccessIds,
    [existingMemberAccessIds]
  );

  const group = isStudioDocument(doc)
    ? "studios"
    : isProjectDocument(doc)
    ? "projects"
    : undefined;

  const handleNewMembersChange = useCallback(
    async (
      e: React.ChangeEvent,
      value: string[],
      docs: (StudioDocument | UserDocument)[]
    ) => {
      const newValue = {
        data: {},
      };
      changedMemberAccessIds.forEach((id) => {
        newValue.data[id] = doc?.changedMembers?.data?.[id];
      });
      const createMemberData = (
        await import("../../../impower-data-state/utils/createMemberData")
      ).default;
      value.forEach((id, index) => {
        newValue.data[id] = createMemberData({
          ...(doc?.changedMembers?.data?.[id] || {}),
          access: MemberAccess.Editor,
          role: "",
          g: group,
          a: {
            u: (docs[index]?.username || docs[index]?.handle) as string,
            h: docs[index]?.hex,
            i: docs[index]?.icon?.fileUrl,
          },
        });
      });
      if (onPropertyInputChange) {
        onPropertyInputChange("changedMembers", newValue);
      }
      if (onPropertyChange) {
        onPropertyChange("changedMembers", newValue);
      }
    },
    [
      changedMemberAccessIds,
      onPropertyInputChange,
      onPropertyChange,
      doc?.changedMembers?.data,
      group,
    ]
  );

  const handleNewDebouncedMembersChange = useCallback(
    async (value: string[], docs: (StudioDocument | UserDocument)[]) => {
      const newValue = {
        data: {},
      };
      changedMemberAccessIds.forEach((id) => {
        newValue.data[id] = doc?.changedMembers?.data?.[id];
      });
      const createMemberData = (
        await import("../../../impower-data-state/utils/createMemberData")
      ).default;
      value.forEach((id, index) => {
        newValue.data[id] = createMemberData({
          ...(doc?.changedMembers?.data?.[id] || {}),
          access: MemberAccess.Editor,
          role: "",
          g: group,
          a: {
            u: (docs[index]?.username || docs[index]?.handle) as string,
            h: docs[index]?.hex,
            i: docs[index]?.icon?.fileUrl,
          },
        });
      });
      if (onDebouncedPropertyChange) {
        onDebouncedPropertyChange("changedMembers", newValue);
      }
    },
    [
      changedMemberAccessIds,
      group,
      doc?.changedMembers?.data,
      onDebouncedPropertyChange,
    ]
  );

  const handleExistingMemberChange = useCallback(
    (e: React.ChangeEvent, uid: string, value: MemberAccess | "Remove") => {
      if (onPropertyInputChange) {
        if (value === "Remove") {
          onPropertyInputChange(`changedMembers.data.${uid}`, null);
        } else {
          onPropertyInputChange(`changedMembers.data.${uid}.access`, value);
        }
      }
      if (onPropertyChange) {
        if (value === "Remove") {
          onPropertyChange(`changedMembers.data.${uid}`, null);
        } else {
          onPropertyChange(`changedMembers.data.${uid}.access`, value);
        }
      }
    },
    [onPropertyChange, onPropertyInputChange]
  );

  const handleDebouncedExistingMemberChange = useCallback(
    (uid: string, value: MemberAccess | "Remove") => {
      if (onDebouncedPropertyChange) {
        if (value === "Remove") {
          onDebouncedPropertyChange(`changedMembers.data.${uid}`, null);
        } else {
          onDebouncedPropertyChange(`changedMembers.data.${uid}.access`, value);
        }
      }
    },
    [onDebouncedPropertyChange]
  );

  const handleNewAccessChange = useCallback(
    (e: React.ChangeEvent, uid: string, value: MemberAccess) => {
      if (onNewAccessChange) {
        onNewAccessChange(uid, value);
      }
    },
    [onNewAccessChange]
  );

  const handleDebouncedNewAccessChange = useCallback(
    (uid: string, value: MemberAccess) => {
      handleNewAccessChange(null, uid, value);
    },
    [handleNewAccessChange]
  );

  const itemSize = 72;

  return (
    <StyledMembersArea
      style={{
        minHeight: Math.min(
          74 + existingMemberAccessIds.length * itemSize,
          216
        ),
      }}
    >
      <StyledMembersContent>
        <AccessDocInput
          key={propertyPath}
          variant="filled"
          InputComponent={FilledInput}
          size={size}
          spacing={spacing}
          backgroundColor={backgroundColor}
          disabled={disabled}
          label={label}
          placeholder={placeholder}
          excludeDocsFromSearch={excludeMemberIdsFromSearch}
          debounceInterval={debounceInterval}
          allowUserAccess
          value={newMemberAccessIds}
          onChange={handleNewMembersChange}
          onDebouncedChange={handleNewDebouncedMembersChange}
        />
        {allowEdit === false ||
        (newAccess && newMemberAccessIds?.length > 0) ? (
          <MemberAccessInput
            propertyPath={propertyPath}
            value={newAccess}
            spacing={spacing}
            variant={variant}
            InputComponent={InputComponent}
            size={size}
            backgroundColor={backgroundColor}
            accessOnly
            onDebouncedChange={handleDebouncedNewAccessChange}
            onChange={handleNewAccessChange}
            getInspector={getInspector}
          />
        ) : (
          memberDocs && (
            <>
              {existingMemberAccessIds.map((id, index) => {
                const doc = memberDocs?.[id || ""];
                const disabled =
                  id === uid &&
                  (creating ||
                    !Object.entries(memberDocs).some(
                      ([k, v]) => v.access === "owner" && k !== uid
                    ));
                if (!doc) {
                  return null;
                }
                return (
                  <VirtualizedItem key={id} index={index}>
                    <MemberAccessInput
                      key={id}
                      propertyPath={propertyPath}
                      memberId={id}
                      memberDoc={doc}
                      value={doc?.access}
                      spacing={spacing}
                      variant={variant}
                      InputComponent={InputComponent}
                      size={size}
                      disabled={disabled}
                      backgroundColor={backgroundColor}
                      onChange={handleExistingMemberChange}
                      onDebouncedChange={handleDebouncedExistingMemberChange}
                      getInspector={getInspector}
                    />
                  </VirtualizedItem>
                );
              })}
            </>
          )
        )}
      </StyledMembersContent>
    </StyledMembersArea>
  );
};

export default PageMembersField;
