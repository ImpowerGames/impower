import styled from "@emotion/styled";
import Tab, { TabProps } from "@material-ui/core/Tab";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import BellSolidIcon from "../../../resources/icons/solid/bell.svg";
import FireSolidIcon from "../../../resources/icons/solid/fire.svg";
import TrophyStarSolidIcon from "../../../resources/icons/solid/trophy-star.svg";
import { FontIcon } from "../../impower-icon";
import { Tabs } from "../../impower-route";
import PitchToolbar from "./PitchToolbar";

export type PitchToolbarTab = "following" | "trending" | "top";

const tabs: PitchToolbarTab[] = ["following", "trending", "top"];
const tabLabels: { [tab in PitchToolbarTab]: string } = {
  following: "Following",
  trending: "Trending",
  top: "Top",
};
const icons = [BellSolidIcon, FireSolidIcon, TrophyStarSolidIcon];

const StyledToolbarContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
`;

const StyledPitchTabs = styled(Tabs)`
  min-height: ${(props): string => props.theme.minHeight.navigationTabs};
  & .MuiTabs-flexContainer {
    justify-content: center;
  }
`;

const StyledTab = styled(Tab)`
  flex: 1;
  justify-content: flex-start;
  min-width: ${(props): string => props.theme.spacing(6)};
  min-height: calc(
    ${(props): string => props.theme.minHeight.navigationTabs} +
      ${(props): string => props.theme.spacing(1)}
  );
  padding-bottom: ${(props): string => props.theme.spacing(1)};
  padding-left: ${(props): string => props.theme.spacing(5)};
  padding-right: ${(props): string => props.theme.spacing(5)};

  ${(props): string => props.theme.breakpoints.down("md")} {
    min-width: ${(props): string => props.theme.spacing(6)};
    padding-bottom: ${(props): string => props.theme.spacing(1)};
    padding-left: ${(props): string => props.theme.spacing(8)};
    padding-right: ${(props): string => props.theme.spacing(8)};
  }

  ${(props): string => props.theme.breakpoints.down("sm")} {
    min-width: ${(props): string => props.theme.spacing(14)};
    padding-bottom: ${(props): string => props.theme.spacing(1)};
    padding-left: ${(props): string => props.theme.spacing(1)};
    padding-right: ${(props): string => props.theme.spacing(1)};
  }
`;

interface PitchTabProps extends TabProps {
  tab?: PitchToolbarTab;
  index?: number;
  selectedIndex?: number;
}

const PitchTab = React.memo((props: PitchTabProps): JSX.Element => {
  const { tab, index, selectedIndex, ...tabProps } = props;

  const iconStyle = useMemo(() => ({ marginTop: 1, marginBottom: 2 }), []);

  const Icon = icons[index];

  const icon = useMemo(() => <Icon />, [Icon]);

  const label = useMemo(
    () => (
      <>
        <FontIcon aria-label={tab} size={17} style={iconStyle}>
          {icon}
        </FontIcon>
        {tabLabels?.[tab]}
      </>
    ),
    [icon, iconStyle, tab]
  );

  const tabStyle = useMemo(
    () => ({ minWidth: 0, marginTop: -8, paddingTop: 8 }),
    []
  );

  const disabled = !(selectedIndex >= 0);

  return (
    <StyledTab
      disabled={disabled}
      label={label}
      style={tabStyle}
      {...tabProps}
    />
  );
});

interface PitchTabsToolbarProps {
  contentRef?: React.Ref<HTMLDivElement>;
  value?: PitchToolbarTab;
  onChange?: (value: PitchToolbarTab) => void;
}

const PitchTabsToolbar = React.memo(
  (props: PitchTabsToolbarProps): JSX.Element => {
    const { contentRef, value, onChange } = props;

    const [tabIndex, setTabIndex] = useState<number>(tabs?.indexOf(value));

    useEffect(() => {
      setTabIndex(tabs.indexOf(value));
    }, [value]);

    const handleChangeTab = useCallback(
      (e: React.ChangeEvent, newValue: number): void => {
        setTabIndex(newValue);
        if (onChange) {
          onChange(tabs[newValue]);
        }
      },
      [onChange]
    );

    const indicatorStyle = useMemo(
      () => ({ display: tabIndex >= 0 ? undefined : "none" }),
      [tabIndex]
    );

    return (
      <PitchToolbar>
        <StyledToolbarContent ref={contentRef}>
          <StyledPitchTabs
            disabled={!(tabIndex >= 0)}
            value={tabIndex}
            indicatorStyle={indicatorStyle}
            indicatorColor="white"
            onChange={handleChangeTab}
          >
            {tabs.map((tab, index) => {
              return (
                <PitchTab
                  key={tab}
                  tab={tab}
                  index={index}
                  selectedIndex={tabIndex}
                />
              );
            })}
          </StyledPitchTabs>
        </StyledToolbarContent>
      </PitchToolbar>
    );
  }
);

export default PitchTabsToolbar;
