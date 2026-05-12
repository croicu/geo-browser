import { AppError } from "../errors";
import { getLogger } from "../services";

type CatalogHead = {
  version: number;
  catalogUrl: string;
};

export interface ResolveCatalogUrlOptions {
    headUrl?: string;
    fallbackUrl?: string;
}

const BASE = import.meta.env.BASE_URL;
const DEFAULT_HEAD_URL = `${BASE}catalog.head.json`;
const DEFAULT_FALLBACK_URL = `${BASE}catalog.json`;

export async function resolveCatalogUrl(
    options: ResolveCatalogUrlOptions = {}
): Promise<string> {
    const headUrl = options.headUrl ?? DEFAULT_HEAD_URL;
    const fallbackUrl = options.fallbackUrl ?? DEFAULT_FALLBACK_URL;

  try {
    const response = await fetch(headUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new AppError("catalog_head.fetch_failed", `Failed to fetch catalog head: ${response.status}`);
    }

    const json = (await response.json()) as unknown;

    if (!isCatalogHead(json)) {
      throw new AppError("catalog_head.invalid_payload", "Invalid catalog head payload");
    }

    return resolveUrl(json.catalogUrl, headUrl);
  } catch (err) {
    getLogger().warning("catalog_head_fallback", {
      message: "Falling back to bootstrap catalog",
      cause: err,
    });

    return fallbackUrl;
  }
}

export function resolveUrl(url: string, base: string): string {
    return new URL(url, new URL(base, window.location.href)).href;
}

function isCatalogHead(value: unknown): value is CatalogHead {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    record.version === 1 &&
    typeof record.catalogUrl === "string" &&
    record.catalogUrl.length > 0
  );
}
