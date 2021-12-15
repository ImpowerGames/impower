import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Backdrop from "@material-ui/core/Backdrop";
import Button from "@material-ui/core/Button";
import { blue, deepOrange, grey, pink, purple } from "@material-ui/core/colors";
import Typography from "@material-ui/core/Typography";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import BookOpenSolidIcon from "../../../resources/icons/solid/book-open.svg";
import ImageSolidIcon from "../../../resources/icons/solid/image.svg";
import LightbulbOnSolidIcon from "../../../resources/icons/solid/lightbulb-on.svg";
import PlusSolidIcon from "../../../resources/icons/solid/plus.svg";
import VolumeHighSolidIcon from "../../../resources/icons/solid/volume-high.svg";
import { FileType } from "../../impower-core";
import {
  ContributionDocument,
  ContributionType,
} from "../../impower-data-store";
import { FontIcon } from "../../impower-icon";
import {
  PopAnimation,
  RotateAnimation,
  UnmountAnimation,
} from "../../impower-route";
import CornerButton from "../../impower-route-engine/components/fabs/CornerButton";
import { getFileSizeLimit } from "../../impower-storage";
import { ToastContext, toastTop } from "../../impower-toast";
import { UserContext } from "../../impower-user";

const colors: { [type in ContributionType]: string } = {
  pitch: purple[500],
  story: pink[500],
  image: blue[600],
  audio: deepOrange[500],
};
const icons: { [type in ContributionType]: string } = {
  pitch: LightbulbOnSolidIcon,
  story: BookOpenSolidIcon,
  image: ImageSolidIcon,
  audio: VolumeHighSolidIcon,
};

const StyledContributionToolbarArea = styled.div`
  pointer-events: none;
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  height: ${(props): string => props.theme.spacing(11)};
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
  z-index: 2;
`;

const StyledButtonTypography = styled(Typography)`
  line-height: 1;
  font-size: ${(props): string | number =>
    props.theme.typography.body1.fontSize};
`;

const StyledFileInput = styled.input`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  max-width: 100%;
  min-height: 100%;
  display: none;
`;

const StyledFileInputLabel = styled.label`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledPopAnimation = styled(PopAnimation)`
  display: flex;
`;

const StyledStaticWrapper = styled.div`
  pointer-events: none;
  display: flex;
  justify-content: flex-end;
`;

const getFileType = (contributionType: ContributionType): FileType =>
  contributionType === "story" || contributionType === "pitch"
    ? "text/*"
    : contributionType === "image"
    ? "image/*"
    : contributionType === "audio"
    ? "audio/*"
    : undefined;

interface TabLabelProps {
  tab: ContributionType;
  label?: string;
  icon?: React.ReactNode;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

const TabLabel = React.memo((props: TabLabelProps) => {
  const { tab, label, icon, onUpload } = props;
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
      {(tab === "image" || tab === "audio") && onUpload && (
        <>
          <StyledFileInput
            id={`toolbar-${tab}`}
            type="file"
            accept={getFileType(tab)}
            onChange={(e): Promise<void> => onUpload(e)}
          />
          <StyledFileInputLabel htmlFor={`toolbar-${tab}`} />
        </>
      )}
    </>
  );
});

interface ContributionTypeButtonProps {
  contributionType?: "pitch" | "story" | "image" | "audio";
  index?: number;
  color?: string;
  icon?: React.ReactNode;
  existingDoc?: ContributionDocument;
  onAdd?: (
    e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
    doc: ContributionDocument,
    file?: globalThis.File
  ) => void;
}

const ContributionTypeButton = React.memo(
  (props: ContributionTypeButtonProps): JSX.Element => {
    const { contributionType, existingDoc, index, color, icon, onAdd } = props;

    const [, toastDispatch] = useContext(ToastContext);

    const handleAddStoryContribution = useCallback(
      async (e: React.MouseEvent) => {
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        const createContributionDocument = (
          await import(
            "../../impower-data-store/utils/createContributionDocument"
          )
        ).default;
        const doc = createContributionDocument({
          _createdBy: Auth.instance.uid,
          _author: Auth.instance.author,
          content: "",
          contributionType: "story",
          deleted: existingDoc?.deleted || false,
          delisted: existingDoc?.delisted || false,
        });
        if (onAdd) {
          onAdd(e, doc);
        }
      },
      [existingDoc, onAdd]
    );

    const handleAddPitchContribution = useCallback(
      async (e: React.MouseEvent) => {
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        const createContributionDocument = (
          await import(
            "../../impower-data-store/utils/createContributionDocument"
          )
        ).default;
        const doc = createContributionDocument({
          _createdBy: Auth.instance.uid,
          _author: Auth.instance.author,
          content: "",
          contributionType: "pitch",
          deleted: false,
          delisted: existingDoc ? existingDoc.delisted : false,
        });
        if (onAdd) {
          onAdd(e, doc);
        }
      },
      [existingDoc, onAdd]
    );

    const handleUploadFile = useCallback(
      async (
        e: React.ChangeEvent<HTMLInputElement>,
        type: ContributionType
      ) => {
        const { files } = e.target;
        const file = files[0];
        if (!file) {
          return;
        }
        if (file.size > getFileSizeLimit()) {
          const error = "File size must be less than 10mb";
          toastDispatch(toastTop(error, "error"));
          return;
        }
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        const createContributionDocument = (
          await import(
            "../../impower-data-store/utils/createContributionDocument"
          )
        ).default;
        const doc = createContributionDocument({
          _createdBy: Auth.instance.uid,
          _author: Auth.instance.author,
          content: "",
          contributionType: type,
          deleted: false,
          delisted: existingDoc ? existingDoc.delisted : false,
        });
        if (onAdd) {
          onAdd(e, doc, file);
        }
      },
      [existingDoc, onAdd, toastDispatch]
    );

    const disabled = existingDoc && !existingDoc.deleted;
    const disabledLabel = existingDoc?.removed ? "removed" : "submitted!";

    const buttonStyle = useMemo(
      () => ({
        backgroundColor: disabled ? grey[600] : color,
      }),
      [color, disabled]
    );

    return (
      <StyledPopAnimation
        animate={1}
        initial={0}
        exit={0}
        delay={index * -0.05}
      >
        <StyledTypeButton
          disabled={disabled}
          variant="contained"
          style={buttonStyle}
          onClick={
            contributionType === "story"
              ? handleAddStoryContribution
              : contributionType === "pitch"
              ? handleAddPitchContribution
              : undefined
          }
        >
          <TabLabel
            tab={contributionType}
            label={
              disabled
                ? `${contributionType} ${disabledLabel}`
                : contributionType
            }
            icon={icon}
            onUpload={
              contributionType === "image" || contributionType === "audio"
                ? (e): Promise<void> => handleUploadFile(e, contributionType)
                : undefined
            }
          />
        </StyledTypeButton>
      </StyledPopAnimation>
    );
  }
);

interface AddContributionListProps {
  types: ContributionType[];
  pitchId?: string;
  userContributionDocs?: {
    [key: string]: ContributionDocument;
  };
  onAdd?: (
    e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
    doc: ContributionDocument,
    file?: globalThis.File
  ) => void;
}

const AddContributionList = React.memo(
  (props: AddContributionListProps): JSX.Element => {
    const { types, pitchId, userContributionDocs, onAdd } = props;

    const [userState] = useContext(UserContext);
    const { uid } = userState;

    const options: {
      key: ContributionType;
      color: string;
      icon: React.ReactNode;
    }[] = useMemo(
      () =>
        types.map((type) => {
          const Icon = icons[type];
          return {
            key: type,
            color: colors[type],
            icon: <Icon />,
          };
        }),
      [types]
    );

    return (
      <StyledList key="list">
        {options.map(({ key, color, icon }, index) => {
          return (
            <ContributionTypeButton
              key={key}
              contributionType={key}
              index={index}
              color={color}
              icon={icon}
              existingDoc={userContributionDocs?.[`${pitchId}/${uid}-${key}`]}
              onAdd={onAdd}
            />
          );
        })}
      </StyledList>
    );
  }
);

interface AddContributionToolbarProps {
  types: ContributionType[];
  toolbarRef?: React.Ref<HTMLDivElement>;
  pitchId?: string;
  userContributionDocs?: {
    [id: string]: ContributionDocument;
  };
  hidden?: boolean;
  onAdd?: (
    e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
    doc: ContributionDocument,
    file?: globalThis.File
  ) => void;
  style?: React.CSSProperties;
  toolbarAreaStyle?: React.CSSProperties;
}

const AddContributionToolbar = React.memo(
  (props: AddContributionToolbarProps): JSX.Element => {
    const {
      types,
      toolbarRef,
      pitchId,
      userContributionDocs,
      hidden,
      style,
      toolbarAreaStyle,
      onAdd,
    } = props;

    const [hiddenState, setHiddenState] = useState(true);

    useEffect(() => {
      window.requestAnimationFrame(() => {
        setHiddenState(hidden);
      });
    }, [hidden]);

    const [dialOpen, setDialOpen] = useState<boolean>();

    const fabSpacing = 16;

    const fabStyle: React.CSSProperties = useMemo(
      () => ({
        position: "relative",
        marginRight: fabSpacing,
        marginTop: fabSpacing,
        marginBottom: fabSpacing,
        visibility: hiddenState ? "hidden" : undefined,
        ...style,
      }),
      [hiddenState, style]
    );

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

    const fabLabel = "Contribute A Concept";

    const icon = useMemo(
      () => (
        <RotateAnimation animate={dialOpen ? 45 : 0}>
          <FontIcon aria-label={fabLabel} size={15}>
            <PlusSolidIcon />
          </FontIcon>
        </RotateAnimation>
      ),
      [dialOpen]
    );

    const handleAdd = useCallback(
      async (
        e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
        doc: ContributionDocument,
        file?: globalThis.File
      ) => {
        setDialOpen(false);
        if (onAdd) {
          onAdd(e, doc, file);
        }
      },
      [onAdd]
    );

    return (
      <>
        <StyledFixedBackdrop open={dialOpen} onClick={handleClose} />
        <StyledContributionToolbarArea style={toolbarAreaStyle}>
          <StyledStaticWrapper ref={toolbarRef} style={fabStyle}>
            <CornerButton
              variant="regular"
              icon={icon}
              label={fabLabel}
              color="primary"
              onClick={handleToggleOpen}
            >
              <UnmountAnimation>
                {dialOpen && (
                  <AddContributionList
                    types={types}
                    key="list"
                    pitchId={pitchId}
                    userContributionDocs={userContributionDocs}
                    onAdd={handleAdd}
                  />
                )}
              </UnmountAnimation>
            </CornerButton>
          </StyledStaticWrapper>
        </StyledContributionToolbarArea>
      </>
    );
  }
);

export default AddContributionToolbar;
