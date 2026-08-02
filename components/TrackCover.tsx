/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PluginNative } from "@utils/types";
import { useEffect, useState } from "@webpack/common";

import { TEXT } from "../constants";
import { cl } from "./Controls";

const Native = VencordNative.pluginHelpers.YMusicSync as PluginNative<typeof import("../native")> | undefined;

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000];

export function TrackCover({ coverUrl, title }: { coverUrl: string; title: string; }) {
    const [source, setSource] = useState("");
    const [attempt, setAttempt] = useState(0);

    // Discord's CSP blocks remote covers, so they are fetched in the main process.
    useEffect(() => {
        let cancelled = false;
        setSource("");
        setAttempt(0);

        if (coverUrl && Native) {
            void Native.getCoverDataUrl(coverUrl).then(resolved => {
                if (!cancelled) setSource(resolved);
            });
        }

        return () => {
            cancelled = true;
        };
    }, [coverUrl]);

    // A cover host can be briefly unavailable right after a track change.
    useEffect(() => {
        const delay = RETRY_DELAYS_MS[attempt];
        if (!coverUrl || source || delay === undefined || !Native) return;

        let cancelled = false;
        const timer = window.setTimeout(() => {
            void Native.getCoverDataUrl(coverUrl).then(resolved => {
                if (cancelled) return;
                setAttempt(value => value + 1);
                if (resolved) setSource(resolved);
            });
        }, delay);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [coverUrl, source, attempt]);

    if (!source) return null;

    return (
        <img
            className={cl("cover")}
            src={source}
            alt={`${TEXT.cover}: ${title}`}
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setSource("")}
        />
    );
}
