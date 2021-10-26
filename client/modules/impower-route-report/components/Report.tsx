import styled from "@emotion/styled";
import { ButtonProps, OutlinedInput, Typography } from "@material-ui/core";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ReportableDocumentPath } from "../../impower-api";
import {
  getPageType,
  getRootCollection,
  ReportDocument,
  ReportDocumentInspector,
  SlugDocument,
} from "../../impower-data-store";
import createReportDocument from "../../impower-data-store/utils/createReportDocument";
import { useDialogNavigation } from "../../impower-dialog";
import { TextField } from "../../impower-route";
import InspectorForm from "../../impower-route/components/forms/InspectorForm";
import AutocompleteInput from "../../impower-route/components/inputs/AutocompleteInput";
import StringInput from "../../impower-route/components/inputs/StringInput";
import { useRouter } from "../../impower-router";
import { ToastContext, toastTop } from "../../impower-toast";
import {
  UserContext,
  userOnCreateSubmission,
  userOnUpdateSubmission,
} from "../../impower-user";

const title = "Submit a Report";
const submit = "Send";
const subtitle = "What would you like to report?";
const submitted = "Report sent!";
const alreadySubmitted = "Report updated.";

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

export const getPageDocPath = async (
  route: string
): Promise<ReportableDocumentPath> => {
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
  if (route.startsWith("/s/")) {
    const slugSnapshot = await new DataStoreRead(
      "handles",
      slug
    ).get<SlugDocument>();
    const slugDoc = slugSnapshot.data();
    if (slugDoc) {
      return ["studios", slugDoc.id];
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
    return ["pitched_games", ...locationArray] as ReportableDocumentPath;
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

const Report = (): JSX.Element | null => {
  const [query, setQuery] = useState<{ path?: string; url?: string }>();
  const [pageUrl, setPageUrl] = useState("");
  const [pageUrlError, setPageUrlError] = useState("");
  const [doc, setDoc] = useState<ReportDocument>(createReportDocument());

  const [, toastDispatch] = useContext(ToastContext);
  const [userState, userDispatch] = useContext(UserContext);
  const { uid, my_recent_reports } = userState;
  const router = useRouter();

  useEffect(() => {
    if (router.isReady) {
      const { query } = router as { query: { url?: string } };
      if (query) {
        setQuery(query);
        if (query.url) {
          setPageUrl(query.url);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, router.query]);

  const handleGetInspector = useCallback((): ReportDocumentInspector => {
    return ReportDocumentInspector.instance;
  }, []);
  const handleChange = useCallback((data: ReportDocument[]): void => {
    setDoc(data[0]);
  }, []);
  const handlePageUrlInputChange = useCallback((e): void => {
    const { value } = e.target;
    if (!value) {
      setPageUrlError("Page Url is required");
    } else {
      setPageUrlError("");
    }
    setPageUrl(value);
  }, []);

  const [openAccountDialog] = useDialogNavigation("a");

  const handleSubmit = useCallback(
    async (e: React.MouseEvent, data: ReportDocument[]): Promise<void> => {
      const DataStoreRead = (
        await import("../../impower-data-store/classes/dataStoreRead")
      ).default;
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
      setPageUrlError("");
      const reportRead = new DataStoreRead(...docPath, "reports", uid);
      const reportSnapshot = await reportRead.get();
      if (reportSnapshot.exists() || my_recent_reports[reportRead.key]) {
        await new Promise<void>((resolve) =>
          userDispatch(
            userOnUpdateSubmission(resolve, data[0], ...docPath, "reports", uid)
          )
        );
        toastDispatch(toastTop(alreadySubmitted, "info", 3000));
      } else {
        await new Promise<void>((resolve) =>
          userDispatch(
            userOnCreateSubmission(resolve, data[0], ...docPath, "reports", uid)
          )
        );
        toastDispatch(toastTop(submitted, "success", 3000));
      }
      setDoc(createReportDocument());
    },
    [
      uid,
      pageUrl,
      my_recent_reports,
      openAccountDialog,
      toastDispatch,
      userDispatch,
    ]
  );

  const data = useMemo(() => [doc], [doc]);
  const submitButtonProps: ButtonProps = useMemo(
    () => ({
      fullWidth: true,
      variant: "contained",
      color: "primary",
      size: "large",
    }),
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
                value={pageUrl}
                disabled={Boolean(query?.url)}
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
              <InspectorForm
                variant="outlined"
                data={data}
                submitButtonLabel={submit}
                submitButtonProps={submitButtonProps}
                InputComponent={OutlinedInput}
                StringInputComponent={StringInput}
                AutocompleteInputComponent={AutocompleteInput}
                getInspector={handleGetInspector}
                onDebouncedChange={handleChange}
                onSubmit={handleSubmit}
              />
            </StyledFormArea>
          </StyledPaper>
        </StyledContainer>
      </StyledReportContent>
    </StyledReport>
  );
};

export default Report;
