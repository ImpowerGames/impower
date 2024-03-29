import { ResponseTypeMap } from "../types/ResponseTypeMap";

const CYAN = "\x1b[36m%s\x1b[0m";

const sendServerRequest = async <K extends keyof ResponseTypeMap>(
  method: "GET" | "POST" | "PUT",
  url: string | URL,
  responseType: K,
  body?: Document | XMLHttpRequestBodyInit | null | undefined,
  contentType?:
    | "application/x-www-form-urlencoded"
    | "application/json"
    | "text/plain"
) => {
  console.log(CYAN, method, url);
  return new Promise<ResponseTypeMap[K]>((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.responseType = responseType;
      if (typeof body === "string") {
        // When body is a string, 'Content-Type' must be set manually.
        // (defaults to 'text/plain' if none specified)
        xhr.setRequestHeader("Content-Type", contentType || "text/plain");
      }
      xhr.setRequestHeader("X-Requested-With", "XmlHttpRequest");
      xhr.onload = () => {
        try {
          const result = xhr.response;
          if (result && result.error) {
            reject(result);
          } else {
            resolve(result);
          }
          return;
        } catch (err) {
          reject(err);
        }
      };
      xhr.onerror = (err) => {
        reject(err);
      };
      xhr.send(body);
    } catch (err) {
      reject(err);
    }
  });
};

export default sendServerRequest;
