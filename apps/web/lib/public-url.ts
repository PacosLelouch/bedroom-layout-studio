const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.PUBLIC_BASE_PATH ?? "";
export const publicBasePath = configuredBasePath === "/" ? "" : configuredBasePath.replace(/\/$/, "");

export function publicUrl(pathname: string) {
  if (!pathname.startsWith("/")) throw new Error("Public asset paths must start with '/'.");
  return `${publicBasePath}${pathname}`;
}
