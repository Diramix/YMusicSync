/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { net } from "electron";

import {
    CLIENT_NAME,
    CLIENT_VERSION,
    COVER_FETCH_TIMEOUT_MS,
    COVER_HOSTS,
    COVER_REDIRECT_STATUSES,
    COVER_SIZE,
    MAX_COVER_BYTES,
    MAX_COVER_CACHE_ENTRIES,
    MAX_COVER_REDIRECTS
} from "./constants";
import { errorMessage, log } from "./state";

interface DownloadedCover {
    body: Buffer;
    contentType: string;
}

const cache = new Map<string, string>();

// Yandex's raw coverUri ends in a size placeholder (%% or {size}) that returns
// no usable image until it is resolved.
function withCoverSize(url: URL): URL {
    const href = url.href.replace(
        /(?:%25%25|%%|%257Bsize%257D|%7Bsize%7D|\{size\}|%25s|%s)/gi,
        COVER_SIZE
    );

    try {
        return new URL(href);
    } catch {
        return url;
    }
}

function parseAllowedUrl(value: string | null, base?: URL): URL | null {
    if (!value) return null;

    let url: URL;
    try {
        url = base ? new URL(value, base) : new URL(value);
    } catch {
        return null;
    }

    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.port && url.port !== "443") return null;
    if (!COVER_HOSTS.has(url.hostname.toLowerCase())) return null;
    return withCoverSize(url);
}

async function downloadCover(url: URL, redirectCount = 0): Promise<DownloadedCover> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), COVER_FETCH_TIMEOUT_MS);
    timeout.unref();

    try {
        // net.fetch follows the Electron proxy and certificate settings Node's fetch ignores.
        const response = await net.fetch(url.href, {
            redirect: "manual",
            signal: controller.signal,
            headers: {
                Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "User-Agent": `${CLIENT_NAME}/${CLIENT_VERSION}`
            }
        });

        if (COVER_REDIRECT_STATUSES.has(response.status)) {
            if (redirectCount >= MAX_COVER_REDIRECTS) throw new Error("Too many redirects");

            const redirected = parseAllowedUrl(response.headers.get("location"), url);
            if (!redirected) throw new Error("Redirected to a disallowed cover host");
            return downloadCover(redirected, redirectCount + 1);
        }

        if (!response.ok) throw new Error(`Remote server returned HTTP ${response.status}`);

        const contentType = (response.headers.get("content-type") ?? "")
            .split(";", 1)[0]
            .trim()
            .toLowerCase();
        if (!contentType.startsWith("image/")) {
            throw new Error(`Unexpected content type: ${contentType || "unknown"}`);
        }

        const declaredLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_COVER_BYTES) {
            throw new Error("Cover is too large");
        }

        const body = Buffer.from(await response.arrayBuffer());
        if (body.length === 0) throw new Error("Cover response is empty");
        if (body.length > MAX_COVER_BYTES) throw new Error("Cover is too large");

        return { body, contentType };
    } finally {
        clearTimeout(timeout);
    }
}

function remember(key: string, value: string): void {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > MAX_COVER_CACHE_ENTRIES) {
        cache.delete(cache.keys().next().value as string);
    }
}

export async function resolveCoverDataUrl(rawUrl: string): Promise<string> {
    const url = parseAllowedUrl(String(rawUrl ?? ""));
    if (!url) return "";

    const cached = cache.get(url.href);
    if (cached) {
        remember(url.href, cached);
        return cached;
    }

    try {
        const cover = await downloadCover(url);
        const dataUrl = `data:${cover.contentType};base64,${cover.body.toString("base64")}`;
        remember(url.href, dataUrl);
        return dataUrl;
    } catch (error) {
        log(`Cover load failed for ${url.hostname}: ${errorMessage(error)}`);
        return "";
    }
}
