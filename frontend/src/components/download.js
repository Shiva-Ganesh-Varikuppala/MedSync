// Asks the API for a file and saves it. The request carries the sign-in token, which a plain link could not,
// so the file is fetched as a blob and handed to the browser as a download.
export async function downloadFile(call, path, filename) {
  const blob = await call(path, { blob: true });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
