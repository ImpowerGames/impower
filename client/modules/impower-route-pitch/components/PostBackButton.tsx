import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import IconButton from "@material-ui/core/IconButton";
import React, { PropsWithChildren, useCallback } from "react";
import ArrowLeftRegularIcon from "../../../resources/icons/regular/arrow-left.svg";
import { FontIcon } from "../../impower-icon";

const StyledCloseIconButton = styled(IconButton)`
  pointer-events: auto;
  padding: ${(props): string => props.theme.spacing(2)};
  margin-right: ${(props): string => props.theme.spacing(-2)};
  @media (hover: hover) and (pointer: fine) {
    &.MuiIconButton-root:hover {
      background-color: ${(props): string => props.theme.colors.black10};
    }
  }
`;

interface PostBackButtonProps {
  color?: string;
  backUrl?: string;
  style?: React.CSSProperties;
  onBack?: (e: React.MouseEvent) => void;
}

const PostBackButton = React.memo(
  (props: PropsWithChildren<PostBackButtonProps>): JSX.Element => {
    const theme = useTheme();
    const {
      color = theme.palette.secondary.main,
      backUrl,
      style,
      onBack,
    } = props;

    const handleBack = useCallback(
      async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (onBack) {
          onBack(e);
        } else {
          const router = (await import("next/router")).default;
          router.push(backUrl);
        }
      },
      [backUrl, onBack]
    );

    return (
      <StyledCloseIconButton onClick={handleBack} style={style}>
        <FontIcon aria-label={`Back`} color={color} size={24}>
          <ArrowLeftRegularIcon />
        </FontIcon>
      </StyledCloseIconButton>
    );
  }
);

export default PostBackButton;
