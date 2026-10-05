const rows = [...document.querySelectorAll(".monaco-editor .view-lines .view-line")].map(row =>
  row.textContent.replaceAll(String.fromCharCode(160), " ").replaceAll(String.fromCharCode(8203), ""),
);
return { renderedLines: rows };
