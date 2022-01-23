import styled from "@emotion/styled";
import { InputProps } from "@material-ui/core";
import React, { useCallback, useContext, useMemo } from "react";
import UserSolidIcon from "../../../../resources/icons/solid/user.svg";
import { Inspector } from "../../../impower-core";
import { MemberAccess, MemberData } from "../../../impower-data-state";
import { UserContext } from "../../../impower-user";
import FadeAnimation from "../animations/FadeAnimation";
import AutocompleteInput from "./AutocompleteInput";
import MemberAccessItem from "./MemberAccessItem";
import { StringInputProps } from "./StringInput";

const StyledMemberAccessInput = styled.div`
  position: relative;
  flex: 1;
  min-height: ${(props): string => props.theme.spacing(9)};
  overflow: hidden;
  display: flex;
`;

interface MemberAccessItemProps extends StringInputProps {
  propertyPath: string;
  memberId?: string;
  memberDoc?: MemberData;
  InputComponent: React.ComponentType<InputProps>;
  size?: "small" | "medium";
  spacing: number;
  backgroundColor?: string;
  accessOnly?: boolean;
  value: MemberAccess | "Remove";
  style?: React.CSSProperties;
  onChange?: (
    e: React.ChangeEvent,
    memberId?: string,
    value?: MemberAccess | "Remove"
  ) => void;
  onDebouncedChange?: (
    memberId?: string,
    value?: MemberAccess | "Remove"
  ) => void;
  getInspector: (data?: Record<string, unknown>) => Inspector;
}

const MemberAccessInput = React.memo(
  (props: MemberAccessItemProps): JSX.Element => {
    const {
      propertyPath,
      memberId,
      memberDoc,
      disabled,
      variant,
      InputComponent,
      size,
      spacing,
      backgroundColor,
      accessOnly,
      value,
      style,
      onChange,
      onDebouncedChange,
      getInspector,
    } = props;

    const [userState] = useContext(UserContext);
    const { uid } = userState;

    const accessBackgroundColor = memberDoc?.a?.h;
    const accessBackgroundImageSrc = memberDoc?.a?.i
      ? memberDoc?.a?.i
      : undefined;

    const accessPropertyPath = memberId
      ? `${propertyPath}.data.${memberId}.access`
      : `${propertyPath}.data.{id}.access`;

    const handleChange = useCallback(
      (e: React.ChangeEvent, access: MemberAccess | "Remove") => {
        if (onChange) {
          onChange(e, memberId, access);
        }
      },
      [onChange, memberId]
    );

    const handleDebouncedChange = useCallback(
      (access: MemberAccess | "Remove") => {
        if (onDebouncedChange) {
          onDebouncedChange(memberId, access);
        }
      },
      [onDebouncedChange, memberId]
    );

    const inspector = getInspector();

    const label = useMemo(
      () => inspector.getPropertyLabel(accessPropertyPath, memberDoc),
      [accessPropertyPath, inspector, memberDoc]
    );
    const placeholder = useMemo(
      () => inspector.getPropertyPlaceholder(accessPropertyPath, memberDoc),
      [accessPropertyPath, inspector, memberDoc]
    );
    const options = useMemo(
      () => inspector.getPropertyOptions(accessPropertyPath, memberDoc),
      [accessPropertyPath, inspector, memberDoc]
    );
    const debounceInterval = useMemo(
      () =>
        inspector.getPropertyDebounceInterval(accessPropertyPath, memberDoc),
      [accessPropertyPath, inspector, memberDoc]
    );
    const getOptionLabel = useCallback(
      (value: MemberAccess) =>
        inspector.getPropertyDisplayValue(accessPropertyPath, memberDoc, value),
      [accessPropertyPath, inspector, memberDoc]
    );
    const getOptionDescription = useCallback(
      (value: MemberAccess) =>
        inspector.getPropertyValueDescription(
          accessPropertyPath,
          memberDoc,
          value
        ),
      [accessPropertyPath, inspector, memberDoc]
    );
    const getOptionGroup = useCallback(
      (value: MemberAccess) =>
        inspector.getPropertyValueGroup(accessPropertyPath, memberDoc, value),
      [accessPropertyPath, inspector, memberDoc]
    );

    const username = memberDoc?.a?.u || "";

    const name = uid === memberId ? `(You) ${username}` : username;

    return (
      <FadeAnimation duration={0.1}>
        <StyledMemberAccessInput
          style={{
            paddingTop: spacing * 0.5,
            paddingBottom: spacing * 0.5,
            ...style,
          }}
        >
          {memberDoc && (
            <MemberAccessItem
              backgroundColor={accessBackgroundColor}
              backgroundImageSrc={accessBackgroundImageSrc}
              icon={<UserSolidIcon />}
              name={name as string}
              style={{ flex: 2 }}
            >
              {memberDoc?.role || null}
            </MemberAccessItem>
          )}
          <AutocompleteInput
            variant={variant}
            InputComponent={InputComponent}
            size={size}
            backgroundColor={backgroundColor}
            disabled={disabled}
            label={label}
            placeholder={placeholder}
            value={value}
            actions={accessOnly ? undefined : ["Remove"]}
            getOptionLabel={getOptionLabel}
            options={options}
            onChange={handleChange}
            onDebouncedChange={handleDebouncedChange}
            getOptionDescription={getOptionDescription}
            getOptionGroup={getOptionGroup}
            debounceInterval={debounceInterval}
            forcePopupIcon
            disableClearable
            style={{ minWidth: 120 }}
          />
        </StyledMemberAccessInput>
      </FadeAnimation>
    );
  }
);

export default MemberAccessInput;
