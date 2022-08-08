import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Backdrop from "@material-ui/core/Backdrop";
import Button from "@material-ui/core/Button";
import {
  blue,
  cyan,
  green,
  indigo,
  pink,
  purple,
  red,
} from "@material-ui/core/colors";
import Typography from "@material-ui/core/Typography";
import React, { useCallback, useMemo, useState } from "react";
import BookOpenSolidIcon from "../../../resources/icons/solid/book-open.svg";
import GamepadSolidIcon from "../../../resources/icons/solid/gamepad.svg";
import HouseSolidIcon from "../../../resources/icons/solid/house.svg";
import MicrophoneSolidIcon from "../../../resources/icons/solid/microphone.svg";
import MusicSolidIcon from "../../../resources/icons/solid/music.svg";
import PencilSolidIcon from "../../../resources/icons/solid/pencil.svg";
import UserSolidIcon from "../../../resources/icons/solid/user.svg";
import WaveformSolidIcon from "../../../resources/icons/solid/waveform.svg";
import { ProjectType } from "../../impower-data-store";
import { FontIcon } from "../../impower-icon";
import { PopAnimation, UnmountAnimation } from "../../impower-route";
import CornerFab from "../../impower-route/components/fabs/CornerFab";

const projectTypes: ProjectType[] = [
  "game",
  "story",
  "character",
  "environment",
  "music",
  "sound",
  "voice",
];

const projectColors: { [type in ProjectType]: string } = {
  game: red[500],
  story: pink[500],
  character: purple[600],
  environment: indigo[500],
  music: blue[700],
  sound: cyan[700],
  voice: green[700],
};

const projectIcons: { [type in ProjectType]: string } = {
  game: GamepadSolidIcon,
  story: BookOpenSolidIcon,
  character: UserSolidIcon,
  environment: HouseSolidIcon,
  music: MusicSolidIcon,
  sound: WaveformSolidIcon,
  voice: MicrophoneSolidIcon,
};

const StyledAddPitchToolbarArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 3;
  transition: opacity 0.15s ease;
`;

const StyledScrollSentinel = styled.div`
  pointer-events: none;
  position: absolute;
  top: 0px;
  left: 0;
  width: 1px;
  height: 1px;
`;

const StyledList = styled.div`
  pointer-events: none;
`;

const StyledTypeButton = styled(Button)`
  pointer-events: auto;
  touch-action: none;
  flex: 1;
  padding: ${(props): string => props.theme.spacing(2, 3)};
  margin: ${(props): string => props.theme.spacing(1, 1)};
  box-shadow: ${(props): string => props.theme.shadows[6]};
  color: white;
`;

const StyledIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(2)};
`;

const StyledFixedBackdrop = styled(Backdrop)`
  pointer-events: auto;
  touch-action: none;
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
  z-index: 3;
`;

const StyledButtonTypography = styled(Typography)`
  line-height: 1;
  font-size: ${(props): string | number =>
    props.theme.typography.body1.fontSize};
`;

const StyledPopAnimation = styled(PopAnimation)`
  display: flex;
`;

const StyledStaticWrapper = styled.div`
  pointer-events: none;
  display: flex;
  justify-content: flex-end;
`;

interface TabLabelProps {
  tab: ProjectType;
  label?: string;
  icon?: React.ReactNode;
}

const TabLabel = React.memo((props: TabLabelProps) => {
  const { tab, label, icon } = props;
  const theme = useTheme();
  return (
    <>
      {icon && (
        <StyledIconArea>
          <FontIcon aria-label={tab} size={theme.typography.pxToRem(20)}>
            {icon}
          </FontIcon>
        </StyledIconArea>
      )}
      {label && (
        <StyledButtonTypography variant="button">
          {label}
        </StyledButtonTypography>
      )}
    </>
  );
});

interface TypeButtonProps {
  type?: ProjectType;
  index?: number;
  color?: string;
  icon?: React.ReactNode;
  onAdd?: (e: React.MouseEvent, type?: ProjectType) => void;
}

const TypeButton = React.memo((props: TypeButtonProps): JSX.Element => {
  const { type, index, color, icon, onAdd } = props;

  const handleAdd = useCallback(
    async (e: React.MouseEvent) => {
      if (onAdd) {
        onAdd(e, type);
      }
    },
    [onAdd, type]
  );

  const buttonStyle = useMemo(
    () => ({
      backgroundColor: color,
    }),
    [color]
  );

  return (
    <StyledPopAnimation animate={1} initial={0} exit={0} delay={index * -0.05}>
      <StyledTypeButton
        variant="contained"
        style={buttonStyle}
        onClick={handleAdd}
      >
        <TabLabel tab={type} label={type} icon={icon} />
      </StyledTypeButton>
    </StyledPopAnimation>
  );
});

interface AddContributionListProps {
  options: ProjectType[];
  onAdd?: (e: React.MouseEvent, type?: ProjectType) => void;
}

const AddContributionList = React.memo(
  (props: AddContributionListProps): JSX.Element => {
    const { options, onAdd } = props;

    const buttons: {
      key: ProjectType;
      color: string;
      icon: React.ReactNode;
    }[] = useMemo(
      () =>
        options.map((type) => {
          const Icon = projectIcons[type];
          return {
            key: type,
            color: projectColors[type],
            icon: <Icon />,
          };
        }),
      [options]
    );

    return (
      <StyledList key="list">
        {buttons.map(({ key, color, icon }, index) => {
          return (
            <TypeButton
              key={key}
              type={key}
              index={index}
              color={color}
              icon={icon}
              onAdd={onAdd}
            />
          );
        })}
      </StyledList>
    );
  }
);

interface AddPitchToolbarProps {
  type?: ProjectType;
  options?: ProjectType[];
  toolbarRef?: React.Ref<HTMLDivElement>;
  label?: string;
  onAdd?: (e: React.MouseEvent, type: ProjectType) => void;
}

const AddPitchToolbar = React.memo(
  (props: AddPitchToolbarProps): JSX.Element => {
    const { type, options = projectTypes, toolbarRef, label, onAdd } = props;

    const [scrollSentinel, setScrollSentinel] = useState<HTMLElement>();
    const [dialOpen, setDialOpen] = useState<boolean>();

    const handleScrollSentinelRef = useCallback((instance: HTMLDivElement) => {
      if (instance) {
        setScrollSentinel(instance);
      }
    }, []);

    const handleToggleOpen = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (dialOpen) {
          setDialOpen(false);
        } else {
          setDialOpen(true);
        }
      },
      [dialOpen]
    );

    const handleClose = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDialOpen(false);
    }, []);

    const handleAdd = useCallback(
      async (e: React.MouseEvent, newType?: ProjectType) => {
        if (onAdd) {
          onAdd(e, newType || type);
        }
      },
      [onAdd, type]
    );

    const handleAddType = useCallback(
      async (e: React.MouseEvent, newType: ProjectType) => {
        setDialOpen(false);
        await new Promise((resolve) => {
          window.setTimeout(resolve, 1);
        });
        handleAdd(e, newType);
      },
      [handleAdd]
    );

    const theme = useTheme();

    const fabMaxWidth = theme.breakpoints.values.sm;

    const fabSpacing = theme.spacing(3);

    const fabStyle: React.CSSProperties = useMemo(
      () => ({
        position: "fixed",
        left: fabSpacing,
        right: fabSpacing,
        bottom: fabSpacing,
        maxWidth: fabMaxWidth,
        margin: "auto",
      }),
      [fabMaxWidth, fabSpacing]
    );

    const icon = useMemo(
      () => (
        <FontIcon aria-label={label} size={15}>
          <PencilSolidIcon />
        </FontIcon>
      ),
      [label]
    );
    return (
      <>
        <StyledScrollSentinel ref={handleScrollSentinelRef} />
        <StyledFixedBackdrop open={dialOpen} onClick={handleClose} />
        <StyledAddPitchToolbarArea id="add-pitch-toolbar" ref={toolbarRef}>
          <StyledStaticWrapper ref={toolbarRef} style={fabStyle}>
            <CornerFab
              icon={icon}
              label={label}
              color="primary"
              scrollSentinel={scrollSentinel}
              onClick={type ? handleAdd : handleToggleOpen}
              style={fabStyle}
            >
              {!type && (
                <UnmountAnimation>
                  {dialOpen && (
                    <AddContributionList
                      options={options}
                      key="list"
                      onAdd={handleAddType}
                    />
                  )}
                </UnmountAnimation>
              )}
            </CornerFab>
          </StyledStaticWrapper>
        </StyledAddPitchToolbarArea>
      </>
    );
  }
);

export default AddPitchToolbar;
