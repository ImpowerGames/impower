import styled from "@emotion/styled";
import FilledInput from "@material-ui/core/FilledInput";
import React, { useCallback, useMemo } from "react";
import { difference } from "../../../impower-core";
import { MemberAccess, MemberData } from "../../../impower-data-state";
import {
  AccessDocument,
  isGameDocument,
  isResourceDocument,
  isStudioDocument,
} from "../../../impower-data-store";
import { VirtualizedItem } from "../../../impower-react-virtualization";
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
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  padding: ${(props): string => props.theme.spacing(0, 1)};
`;

export interface PageMembersFieldProps extends RenderPropertyProps {
  data: AccessDocument[];
  memberDocs?: {
    [id: string]: MemberData;
  };
  allowEdit?: boolean;
  newAccess?: MemberAccess;
  onNewAccessChange?: (access: MemberAccess) => void;
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
    allowEdit,
    newAccess,
    getInspector,
    onPropertyChange,
    onDebouncedPropertyChange,
    onNewAccessChange,
  } = props;

  const doc = data[0];

  const existingMemberAccessIds = useMemo(
    () => Object.keys(memberDocs || {}),
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
    () => [...changedMemberAccessIds, ...existingMemberAccessIds],
    [changedMemberAccessIds, existingMemberAccessIds]
  );

  const group = isStudioDocument(doc)
    ? "studios"
    : isResourceDocument(doc)
    ? "resources"
    : isGameDocument(doc)
    ? "games"
    : undefined;

  const handleNewMembersChange = useCallback(
    async (e: React.ChangeEvent, value: string[]) => {
      const newValue = {
        data: {},
      };
      changedMemberAccessIds.forEach((id) => {
        newValue.data[id] = doc?.changedMembers?.data?.[id];
      });
      const createMemberData = (
        await import("../../../impower-data-state/utils/createMemberData")
      ).default;
      value.forEach((id) => {
        newValue.data[id] = createMemberData({
          ...(doc?.changedMembers?.data?.[id] || {}),
          access: MemberAccess.Editor,
          role: "",
          g: group,
        });
      });
      if (onPropertyChange) {
        onPropertyChange("members", newValue);
      }
    },
    [changedMemberAccessIds, group, doc?.changedMembers?.data, onPropertyChange]
  );

  const handleNewDebouncedMembersChange = useCallback(
    async (value: string[]) => {
      const newValue = {
        data: {},
      };
      changedMemberAccessIds.forEach((id) => {
        newValue.data[id] = doc?.changedMembers?.data?.[id];
      });
      const createMemberData = (
        await import("../../../impower-data-state/utils/createMemberData")
      ).default;
      value.forEach((id) => {
        newValue.data[id] = createMemberData({
          ...(doc?.changedMembers?.data?.[id] || {}),
          access: MemberAccess.Editor,
          role: "",
          g: group,
        });
      });
      if (onDebouncedPropertyChange) {
        onDebouncedPropertyChange("members", newValue);
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
      if (onPropertyChange) {
        if (value === "Remove") {
          onPropertyChange(`members.data.${uid}`, null);
        } else {
          onPropertyChange(`members.data.${uid}.access`, value);
        }
      }
    },
    [onPropertyChange]
  );

  const handleDebouncedExistingMemberChange = useCallback(
    (uid: string, value: MemberAccess | "Remove") => {
      if (value === "Remove") {
        if (onDebouncedPropertyChange) {
          if (value === "Remove") {
            onDebouncedPropertyChange(`members.data.${uid}`, null);
          } else {
            onDebouncedPropertyChange(`members.data.${uid}.access`, value);
          }
        }
      }
    },
    [onDebouncedPropertyChange]
  );

  const handleDebouncedNewAccessChange = useCallback(
    (uid: string, value: MemberAccess) => {
      if (onNewAccessChange) {
        onNewAccessChange(value);
      }
    },
    [onNewAccessChange]
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
        {!allowEdit || (newAccess && newMemberAccessIds?.length > 0) ? (
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
            getInspector={getInspector}
          />
        ) : (
          memberDocs && (
            <>
              {existingMemberAccessIds.map((id, index) => {
                const doc = memberDocs?.[id || ""];
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
