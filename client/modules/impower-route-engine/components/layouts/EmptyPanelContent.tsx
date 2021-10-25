import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React from "react";
import { FontIcon } from "../../../impower-icon";
import { AccessibleEvent } from "../../../impower-route";

const StyledEmptyPanelContent = styled.div<{ color: string }>`
  padding: ${(props): string => props.theme.spacing(3)};
  position: relative;
  border-radius: ${(props): string => props.theme.borderRadius.info};
  border: 1px solid ${(props): string => props.color}99;
  color: ${(props): string => props.color};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  flex: 1;
`;

const StyledIconArea = styled.div`
  padding-bottom: ${(props): string => props.theme.spacing(2)};
`;

interface EmptyPanelContentProps {
  instruction: string;
  name: string;
  icon?: React.ReactNode;
  onContextMenu?: (event: AccessibleEvent) => void;
}

const EmptyPanelContent = React.memo(
  (props: EmptyPanelContentProps): JSX.Element => {
    const { instruction, icon, name, onContextMenu } = props;

    const theme = useTheme();

    const foregroundTextColor = theme.colors.darkForegroundText;

    return (
      <StyledEmptyPanelContent
        color={foregroundTextColor}
        onContextMenu={onContextMenu}
      >
        {icon && (
          <StyledIconArea>
            <FontIcon size={48} aria-label={name}>
              {icon}
            </FontIcon>
          </StyledIconArea>
        )}
        {/* eslint-disable-next-line react/no-danger */}
        <div
          dangerouslySetInnerHTML={{ __html: instruction }}
          style={{ opacity: 0.6 }}
        />
      </StyledEmptyPanelContent>
    );
  }
);

export default EmptyPanelContent;
