import {
  useSavedScroll as useLibraryScroll,
  useTabQuery as useLibraryQuery,
} from "../library-page";

export const useTabQuery = (tab: string) => useLibraryQuery("scriptsQueries", tab);

export const useSavedScroll = (tab: string) => useLibraryScroll("scriptsScrolls", tab);
