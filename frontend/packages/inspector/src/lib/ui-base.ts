const UI_MARKER = "/ui/";

export function getUiBasePath(): string {
  if (typeof window === "undefined") {
    return UI_MARKER;
  }

  const path = window.location.pathname;
  const index = path.indexOf(UI_MARKER);
  if (index === -1) {
    return UI_MARKER;
  }

  return path.slice(0, index + UI_MARKER.length);
}

export function getServerBaseUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const uiBasePath = getUiBasePath();
  return `${window.location.origin}${uiBasePath.slice(0, -"/ui/".length)}`;
}

export function assetUrl(path: string): string {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return `${getUiBasePath()}${normalized}`;
}

