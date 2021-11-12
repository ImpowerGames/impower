import styled from "@emotion/styled";
import {
  Autocomplete,
  AutocompleteProps,
  OutlinedInput,
  Typography
} from "@material-ui/core";
import { LoadingButton } from "@material-ui/lab";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { InteractiveDocumentPath } from "../../impower-api";
import { getLabel } from "../../impower-config";
import {
  getPageType,
  getRootCollection,
  ReportReason,
  SlugDocument
} from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import HistoryState from "../../impower-dialog/classes/historyState";
import { TextField } from "../../impower-route";
import { useRouter } from "../../impower-router";
import { ToastContext, toastTop } from "../../impower-toast";
import { UserContext } from "../../impower-user";
import userDoReport from "../../impower-user/utils/userDoReport";
import userUndoReport from "../../impower-user/utils/userUndoReport";

const title = "Submit a Report";
const submit = "Send";
const subtitle = "What would you like to report?";
const submitted = "Report sent!";
const reportDeleted = "Report canceled.";
const back = "Return to previous page";

const reasonDescriptions: { [reason in ReportReason]: string } = {
  spam: "It is spam",
  unattributed: "It uses an asset without required attribution",
  infrigement: "It infringes copyright or trademark rights",
  harrassment: "It abuses or harasses someone",
  misinformation: "It spreads misinformation",
  privacy_violation: "It violates someone's privacy",
  illegal_transaction: "It is a transaction for prohibited goods or services",
  self_harm: "Someone is considering suicide or self-harm",
  untagged_nsfw_content:
    "It contains mature or explicit content but is not tagged appropriately",
  involuntary_pornography: "It is involuntary pornography",
};

const StyledReport = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background-color: white;
`;

const StyledReportContent = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
`;

const StyledContainer = styled.div`
  padding: ${(props): string => props.theme.spacing(0, 3)};
  max-width: 100%;
  width: ${(props): string => props.theme.spacing(60)};
  margin: auto;
`;

const StyledPaper = styled.div`
  padding: ${(props): string => props.theme.spacing(4)} 0;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const StyledTitleTypography = styled(Typography)`
  text-align: center;
  text-decoration: none;
  font-weight: 700;
  font-family: ${(props): string => props.theme.fontFamily.title};

  min-height: 32px;
  text-decoration: none;

  font-size: ${(props): string => props.theme.fontSize.title};
  z-index: 1;
`;

const StyledSubtitleTypography = styled(Typography)`
  text-align: center;
  padding: ${(props): string => props.theme.spacing(1)};
  font-size: ${(props): string => props.theme.fontSize.large};
`;

const StyledFormArea = styled.div`
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const StyledAutocomplete = styled(Autocomplete)``;

const StyledButton = styled(LoadingButton)``;

export const getPageDocPath = async (
  route: string
): Promise<InteractiveDocumentPath> => {
  const DataStoreRead = (
    await import("../../impower-data-store/classes/dataStoreRead")
  ).default;
  const relativeRoute = route
    .replace("https://", "")
    .replace("http://", "")
    .replace("www.", "")
    .replace("dev.impower.app", "")
    .replace("test.impower.app", "")
    .replace("impower.app", "")
    .replace("impower.games", "");
  const subPageIndex = relativeRoute.substring(1).indexOf("/");
  const slug =
    subPageIndex >= 0 ? relativeRoute.substring(subPageIndex + 2) : "";
  if (route.startsWith("/u/")) {
    const slugSnapshot = await new DataStoreRead(
      "handles",
      slug
    ).get<SlugDocument>();
    const slugDoc = slugSnapshot.data();
    if (slugDoc) {
      return ["users", slugDoc.id];
    }
  }
  if (route.startsWith("/p/")) {
    const locationArray = slug.split("/");
    locationArray.forEach((v, i) => {
      if (v === "c") {
        locationArray[i] = "contributions";
      }
      if (v === "k") {
        locationArray[i] = "kudos";
      }
    });
    return ["pitched_games", ...locationArray] as InteractiveDocumentPath;
  }
  const baseRoute =
    subPageIndex >= 0
      ? relativeRoute.substring(1, subPageIndex + 1)
      : relativeRoute.substring(0);
  const docType = getPageType(baseRoute);
  const typeCollection = getRootCollection(docType);
  if (!typeCollection) {
    return undefined;
  }
  if (typeCollection === "studios") {
    return undefined;
  }
  const slugSnapshot = await new DataStoreRead(
    "slugs",
    slug
  ).get<SlugDocument>();
  const slugDoc = slugSnapshot.data();
  if (slugDoc) {
    return [typeCollection, slugDoc.id];
  }
  return undefined;
};

interface ReasonAutocompleteProps
  extends Partial<AutocompleteProps<string, boolean, boolean, boolean>> {
  label?: string;
  error?: boolean;
}

const ReasonAutocomplete = React.memo((props: ReasonAutocompleteProps) => {
  const { label, error, disabled, value, options, getOptionLabel, onChange } =
    props;
  const handleRenderInput = useCallback(
    (params): React.ReactNode => (
      <TextField
        {...params}
        variant="outlined"
        InputComponent={OutlinedInput}
        label={label}
        error={error}
      />
    ),
    [error, label]
  );

  return (
    <StyledAutocomplete
      disabled={disabled}
      value={value}
      options={options}
      autoHighlight
      autoSelect
      blurOnSelect
      disablePortal
      disableClearable
      getOptionLabel={getOptionLabel}
      onChange={onChange}
      renderInput={handleRenderInput}
    />
  );
});

const Report = (): JSX.Element | null => {
  const [query, setQuery] = useState<{ path?: string; url?: string }>();
  const [pageUrl, setPageUrl] = useState("");
  const [reason, setReason] = useState<ReportReason>(ReportReason.Spam);
  const [content, setContent] = useState("");
  const [pageUrlError, setPageUrlError] = useState("");
  const [reported, setReported] = useState<boolean>();

  const [, toastDispatch] = useContext(ToastContext);
  const [userState, userDispatch] = useContext(UserContext);
  const { uid, my_reports } = userState;
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady || my_reports === undefined) {
      return;
    }
    const { query } = router as { query: { url?: string } };
    if (query) {
      setQuery(query);
      if (!query.url) {
        setReported(null);
        return;
      }
      setPageUrl(query.url);
      const checkReported = async (): Promise<void> => {
        const docPath = await getPageDocPath(query.url);
        if (!docPath) {
          setReported(null);
          return;
        }
        const existingReport = my_reports?.[docPath.join("%")];
        setReported(Boolean(existingReport));
        setReason((existingReport?.type as ReportReason) || ReportReason.Spam);
        setContent(existingReport?.c || "");
      };
      checkReported();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, router.query, my_reports]);

  const handlePageUrlInputChange = useCallback((e): void => {
    const { value } = e.target;
    if (!value) {
      setPageUrlError("Page Url is required");
    } else {
      setPageUrlError("");
    }
    setPageUrl(value);
  }, []);
  const handleReasonChange = useCallback(
    (
      event: React.SyntheticEvent<Element, Event>,
      value: ReportReason
    ): void => {
      setReason(value);
    },
    []
  );
  const handleContentInputChange = useCallback((e): void => {
    const { value } = e.target;
    setContent(value);
  }, []);

  const [openAccountDialog] = useDialogNavigation("a");

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!uid) {
      openAccountDialog("signup");
      return;
    }
    if (!pageUrl) {
      setPageUrlError("Page Url is required");
      return;
    }
    const docPath = await getPageDocPath(pageUrl);
    if (!docPath) {
      setPageUrlError("Page Url is invalid");
      return;
    }
    const existingReport = my_reports?.[docPath.join("%")];
    setPageUrlError("");
    if (existingReport) {
      userDispatch(userUndoReport(...docPath));
      toastDispatch(toastTop(reportDeleted, "info", 3000));
      setReported(false);
    } else {
      userDispatch(userDoReport({ type: reason, c: content }, ...docPath));
      toastDispatch(toastTop(submitted, "success", 3000));
      setReported(true);
    }
  }, [
    uid,
    pageUrl,
    my_reports,
    openAccountDialog,
    userDispatch,
    reason,
    content,
    toastDispatch,
  ]);

  const handleBack = useCallback(async () => {
    const router = (await import("next/router")).default;
    if (HistoryState.instance.prev) {
      router.back();
    } else {
      router.replace("/pitch");
    }
  }, []);

  const contentCharacterCountLimit = 300;
  const contentInputProps = useMemo(
    () => ({ maxLength: contentCharacterCountLimit }),
    [contentCharacterCountLimit]
  );

  const reasonOptions = useMemo(() => Object.values(ReportReason), []);
  const handleGetReasonOptionLabel = useCallback(
    (option: string) => `${getLabel(option)} — ${reasonDescriptions[option]}`,
    []
  );
  const handleIsReasonOptionEqualToValue = useCallback(
    (option: string, value: string) => option === value,
    []
  );

  return (
    <StyledReport className={StyledReport.displayName}>
      <StyledReportContent className={StyledReportContent.displayName}>
        <StyledContainer>
          <StyledPaper className={StyledPaper.displayName}>
            <StyledTitleTypography
              className={StyledTitleTypography.displayName}
              variant="h3"
              color="primary"
            >
              {title}
            </StyledTitleTypography>
            <StyledSubtitleTypography
              className={StyledSubtitleTypography.displayName}
              variant="h5"
            >
              {subtitle}
            </StyledSubtitleTypography>
            <StyledFormArea className={StyledFormArea.displayName}>
              <TextField
                disabled={reported || Boolean(query?.url)}
                value={pageUrl}
                variant="outlined"
                InputComponent={OutlinedInput}
                margin="normal"
                required
                fullWidth
                label="Page Url"
                id="page-url"
                name="page-url"
                error={Boolean(pageUrlError)}
                helperText={pageUrlError}
                onChange={handlePageUrlInputChange}
              />
              <ReasonAutocomplete
                disabled={reported}
                value={reason}
                fullWidth
                label="Reason"
                id="reason"
                options={reasonOptions}
                getOptionLabel={handleGetReasonOptionLabel}
                isOptionEqualToValue={handleIsReasonOptionEqualToValue}
                onChange={handleReasonChange}
              />
              <TextField
                disabled={reported}
                value={content}
                variant="outlined"
                InputComponent={OutlinedInput}
                margin="normal"
                fullWidth
                label="Additional Information"
                id="content"
                multiline
                inputProps={contentInputProps}
                helperText={`${
                  content?.length || 0
                }/${contentCharacterCountLimit}`}
                minRows={3}
                onChange={handleContentInputChange}
              />
              <StyledButton
                loading={reported === undefined}
                variant="contained"
                fullWidth
                size="large"
                disabled={reported || !pageUrl || Boolean(pageUrlError)}
                onClick={handleSubmit}
              >
                {reported ? submitted : submit}
              </StyledButton>
              <StyledButton
                fullWidth
                size="large"
                onClick={handleBack}
                style={{
                  visibility: reported ? undefined : "hidden",
                  pointerEvents: reported ? undefined : "none",
                }}
              >
                {back}
              </StyledButton>
            </StyledFormArea>
          </StyledPaper>
        </StyledContainer>
      </StyledReportContent>
    </StyledReport>
  );
};

export default Report;
