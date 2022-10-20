import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Tab, { TabProps } from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import React, { useMemo } from "react";
import { abbreviateCount } from "../../impower-config";
import format from "../../impower-config/utils/format";

const StyledTab = styled(Tab)`
  flex: 1;
  max-width: none;

  display: flex;
  flex-direction: row;
  justify-content: center;
`;

const StyledTabCountTypography = styled(Typography)<{ component?: string }>`
  text-transform: none;
  white-space: pre;
  margin-right: ${(props): string => props.theme.spacing(0.5)};
`;

const StyledTabTextTypography = styled(Typography)<{ component?: string }>`
  text-transform: none;
  white-space: pre;
`;

interface PitchPostTabProps extends TabProps {
  selected?: boolean;
  tab?: string;
  label?: string;
  count?: number;
}

const PitchPostTab = React.memo((props: PitchPostTabProps) => {
  const { selected, tab, label, count = 0, ...tabProps } = props;

  const theme = useTheme();

  const labelNode = useMemo(
    () => (
      <>
        {Boolean(count) && (
          <StyledTabCountTypography variant="button">
            {abbreviateCount(count)}
          </StyledTabCountTypography>
        )}
        <StyledTabTextTypography variant="button">
          {format(label, { count })}
        </StyledTabTextTypography>
      </>
    ),
    [count, label]
  );

  const tabStyle = useMemo(
    () => ({
      color: selected ? theme.palette.primary.main : undefined,
      opacity: selected ? 1 : undefined,
    }),
    [selected, theme.palette.primary.main]
  );

  return (
    <StyledTab key={tab} {...tabProps} label={labelNode} style={tabStyle} />
  );
});

export default PitchPostTab;
