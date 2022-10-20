import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Typography from "@mui/material/Typography";
import React, { PropsWithChildren } from "react";
import Avatar from "../elements/Avatar";

const StyledMemberAccessItem = styled.div`
  position: relative;
  flex: 1;
  min-height: ${(props): string => props.theme.spacing(5)};
  overflow: hidden;
`;

const StyledAccessItemContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  white-space: nowrap;
`;

const StyledOptionTextArea = styled.div`
  flex: 1;
`;

const StyledNameTypography = styled(Typography)`
  text-overflow: ellipsis;
`;

const StyledSlugArea = styled.div`
  opacity: 0.7;
`;

const StyledAvatarArea = styled.div`
  position: relative;
  min-width: ${(props): string => props.theme.spacing(5)};
  min-height: ${(props): string => props.theme.spacing(5)};
  width: ${(props): string => props.theme.spacing(5)};
  height: ${(props): string => props.theme.spacing(5)};
  margin-right: ${(props): string => props.theme.spacing(2)};
  border-radius: 50%;
`;

interface MemberAccessItemProps {
  backgroundColor: string;
  backgroundImageSrc: string;
  icon: React.ReactNode;
  name: string;
  style?: React.CSSProperties;
  getPlaceholderUrl?: (fileUrl: string) => string;
}

const MemberAccessItem = React.memo(
  (props: PropsWithChildren<MemberAccessItemProps>): JSX.Element => {
    const {
      backgroundColor,
      backgroundImageSrc,
      icon,
      name,
      style,
      getPlaceholderUrl,
      children,
    } = props;
    const theme = useTheme();
    return (
      <StyledMemberAccessItem style={style}>
        <StyledAccessItemContent>
          <StyledAvatarArea>
            <Avatar
              backgroundColor={backgroundColor}
              alt={name}
              src={backgroundImageSrc}
              icon={icon}
              fontSize={theme.fontSize.smallerIcon}
              placeholder={getPlaceholderUrl}
              style={{
                borderRadius: "inherit",
                width: "100%",
                height: "100%",
              }}
            />
          </StyledAvatarArea>
          <StyledOptionTextArea>
            {name && <StyledNameTypography>{name}</StyledNameTypography>}
            {children && <StyledSlugArea>{children}</StyledSlugArea>}
          </StyledOptionTextArea>
        </StyledAccessItemContent>
      </StyledMemberAccessItem>
    );
  }
);

export default MemberAccessItem;
