import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Divider from "@material-ui/core/Divider";
import OutlinedInput from "@material-ui/core/OutlinedInput";
import Paper from "@material-ui/core/Paper";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import HeartRegularIcon from "../../../resources/icons/regular/heart.svg";
import HeartSolidIcon from "../../../resources/icons/solid/heart.svg";
import { InteractiveDocumentPath } from "../../impower-api";
import { AggData } from "../../impower-data-state";
import { getDataStoreKey } from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import { FontIcon } from "../../impower-icon";
import FadeAnimation from "../../impower-route/components/animations/FadeAnimation";
import StringInput from "../../impower-route/components/inputs/StringInput";
import {
  UserContext,
  userDoKudo,
  userDoLike,
  userUndoKudo,
} from "../../impower-user";

const CreateKudoDialog = dynamic(() => import("./CreateKudoDialog"), {
  ssr: false,
});

const StyledKudoToolbarArea = styled.div`
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  height: ${(props): string => props.theme.minHeight.titleBar};
  background-color: white;
`;

const StyledPaper = styled(Paper)`
  position: absolute;
  top: 0;
  bottom: 3px;
  left: 0;
  right: 0;
  border-radius: 0;
`;

const StyledAddKudoToolbar = styled(FadeAnimation)`
  width: 100%;
  display: flex;
  flex-direction: column;
  z-index: 1300;
  width: 100%;
  margin: auto;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  position: relative;
  background-color: white;
`;

const StyledToolbar = styled.div`
  display: flex;
  width: 100%;
  box-shadow: ${(props): string => props.theme.shadows[1]};
  color: white;
  align-items: center;
  padding: ${(props): string => props.theme.spacing(0.5, 0.5)};
`;

const StyledButton = styled(Button)`
  padding: ${(props): string => props.theme.spacing(1, 2)};
  margin-left: ${(props): string => props.theme.spacing(0.5)};
`;

const StyledButtonIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1)};
`;

const StyledSentArea = styled.div`
  flex: 1;
  padding: ${(props): string => props.theme.spacing(0, 1)};
  display: flex;
  justify-content: flex-end;
  opacity: 0.5;
`;

const StyledFlex = styled.div`
  flex: 1;
  display: flex;
  width: 100%;
  align-items: center;
`;

const StyledDivider = styled(Divider)``;

const StyledOutlinedInput = styled(OutlinedInput)`
  & fieldset {
    border: none;
  }

  & input::placeholder {
    color: black;
    opacity: 0.6;
  }
`;

interface AddKudoToolbarProps {
  toolbarRef?: React.Ref<HTMLDivElement>;
  pitchId: string;
  contributionId: string;
  style?: React.CSSProperties;
  toolbarAreaStyle?: React.CSSProperties;
  onKudo?: (
    e: React.MouseEvent | React.ChangeEvent,
    kudoed: boolean,
    pitchId: string,
    contributionId: string,
    data: AggData
  ) => void;
}

const AddKudoToolbar = React.memo((props: AddKudoToolbarProps): JSX.Element => {
  const pitchedCollection = "pitched_games";

  const {
    toolbarRef,
    pitchId,
    contributionId,
    style,
    toolbarAreaStyle,
    onKudo,
  } = props;

  const [userState, userDispatch] = useContext(UserContext);
  const { uid, my_kudos, my_likes, my_dislikes } = userState;

  const path: InteractiveDocumentPath = useMemo(
    () =>
      pitchId && contributionId
        ? [pitchedCollection, pitchId, "contributions", contributionId]
        : [pitchedCollection, pitchId],
    [pitchedCollection, pitchId, contributionId]
  );
  const existingKudo = my_kudos?.[getDataStoreKey(...path)];
  const liked = my_likes?.[getDataStoreKey(...path)];
  const disliked = my_dislikes?.[getDataStoreKey(...path)];
  const kudoed = Boolean(existingKudo);

  const [kudoState, setKudoState] = useState(kudoed);

  const authenticated = uid !== undefined ? Boolean(uid) : undefined;

  const [contentState, setContentState] = useState(existingKudo?.c || "");

  const theme = useTheme();
  const maxWidth = theme.breakpoints.values.sm;

  useEffect(() => {
    setKudoState(kudoed);
  }, [kudoed]);

  useEffect(() => {
    if (existingKudo?.c) {
      setContentState(existingKudo?.c);
    }
  }, [existingKudo]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setContentState(newValue);
  }, []);

  const [openAccountDialog] = useDialogNavigation("a");

  const handleSubmitKudo = useCallback(
    async (e: React.MouseEvent | React.ChangeEvent, value: string) => {
      if (!authenticated) {
        openAccountDialog("signup");
        return;
      }
      const newKudoed = !kudoState;
      setKudoState(newKudoed);
      const content = value || "";
      const Auth = (await import("../../impower-auth/classes/auth")).default;
      const newKudoData = newKudoed
        ? {
            a: Auth.instance.author,
            t: Date.now(),
            c: content,
          }
        : null;
      if (newKudoed) {
        userDispatch(userDoKudo({ c: content }, ...path));
        if (!liked && !disliked) {
          userDispatch(userDoLike(...path));
        }
      } else {
        userDispatch(userUndoKudo(...path));
      }
      if (onKudo) {
        onKudo(e, newKudoed, pitchId, contributionId, newKudoData);
      }
    },
    [
      authenticated,
      kudoState,
      onKudo,
      openAccountDialog,
      userDispatch,
      path,
      liked,
      disliked,
      pitchId,
      contributionId,
    ]
  );

  const handleSubmitTextField = useCallback(
    (e: React.ChangeEvent<Element>, value: string) => {
      handleSubmitKudo(e, value);
    },
    [handleSubmitKudo]
  );

  const handleClickKudoButton = useCallback(
    (e: React.MouseEvent) => {
      handleSubmitKudo(e, contentState);
    },
    [handleSubmitKudo, contentState]
  );

  const minHeight = 56;

  const characterCountLimit = 300;

  const saveLabel = useMemo(
    () => (
      <>
        <StyledButtonIconArea>
          <FontIcon aria-label={`Kudo`} size={theme.typography.button.fontSize}>
            {kudoState ? <HeartSolidIcon /> : <HeartRegularIcon />}
          </FontIcon>
        </StyledButtonIconArea>
        {kudoState ? `Undo Kudo` : `Kudo`}
      </>
    ),
    [kudoState, theme.typography.button.fontSize]
  );

  const DialogProps = useMemo(
    () => ({ saveLabel, maxWidth }),
    [maxWidth, saveLabel]
  );

  const addKudoToolbarStyle: React.CSSProperties = useMemo(
    () => ({ height: minHeight, maxWidth, ...style }),
    [maxWidth, style]
  );

  const toolbarStyle: React.CSSProperties = useMemo(
    () => ({ minHeight }),
    [minHeight]
  );

  return (
    <StyledKudoToolbarArea style={toolbarAreaStyle}>
      <StyledPaper elevation={2} />
      <StyledAddKudoToolbar
        ref={toolbarRef}
        initial={0}
        animate={1}
        style={addKudoToolbarStyle}
      >
        <StyledDivider />
        <StyledToolbar style={toolbarStyle}>
          {my_kudos !== undefined && (
            <StyledFlex>
              {kudoState ? (
                <StyledSentArea />
              ) : (
                <StringInput
                  value={contentState}
                  variant="outlined"
                  InputComponent={StyledOutlinedInput}
                  size="small"
                  backgroundColor={theme.palette.grey[200]}
                  placeholder={`Include some kind words!`}
                  characterCountLimit={characterCountLimit}
                  onChange={handleChange}
                  onSubmit={handleSubmitTextField}
                  DialogProps={DialogProps}
                  DialogComponent={CreateKudoDialog}
                />
              )}
              <StyledButton
                color="secondary"
                variant={kudoState ? "outlined" : "contained"}
                disableElevation
                onClick={handleClickKudoButton}
              >
                {saveLabel}
              </StyledButton>
            </StyledFlex>
          )}
        </StyledToolbar>
      </StyledAddKudoToolbar>
    </StyledKudoToolbarArea>
  );
});

export default AddKudoToolbar;
