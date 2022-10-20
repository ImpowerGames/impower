import { useTheme } from "@emotion/react";
import IconButton from "@mui/material/IconButton";
import { DynamicIcon, FontIcon } from "../../../impower-icon";

interface MoreButtonProps {
  propertyPath?: string;
  moreIcon?: string;
  moreTooltip?: string;
  moreIconSize?: string;
  onMore?: (id: string, target: HTMLElement) => void;
}

const MoreButton = (props: MoreButtonProps): JSX.Element => {
  const { propertyPath, moreIcon, moreTooltip, moreIconSize, onMore } = props;
  const theme = useTheme();
  return (
    <IconButton
      style={{
        minWidth: theme.minWidth.headerIcon,
        borderRadius: theme.spacing(1),
      }}
      onClick={(e): void => {
        e.stopPropagation();
        if (onMore) {
          const properties = propertyPath?.split(".") || [];
          const property = properties[properties.length - 1];
          onMore(property, e.currentTarget as HTMLElement);
        }
      }}
    >
      <FontIcon
        aria-label={moreTooltip}
        size={moreIconSize}
        color={theme.colors.subtitle}
      >
        <DynamicIcon icon={moreIcon} variant="regular" />
      </FontIcon>
    </IconButton>
  );
};

export default MoreButton;
