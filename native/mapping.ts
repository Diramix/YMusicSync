/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { net } from "electron";

import type { PlayerDevice, PlayerSnapshot, RepeatMode, YnisonDevice, YnisonState } from "../types";
import { MAX_ARTIST_CACHE_ENTRIES } from "./constants";
import { emitSnapshot } from "./events";
import { errorMessage, log, state } from "./state";
import { STATION_PREFIX } from "./station/constants";

interface TracksResponse {
    result?: { artists?: { id?: unknown; name?: unknown; }[]; }[];
}

interface TrackArtists {
    names: string;
    url: string;
}

const artistCache = new Map<string, TrackArtists>();
const artistLookups = new Set<string>();

async function fetchArtists(trackId: string): Promise<TrackArtists> {
    const response = await net.fetch(`https://api.music.yandex.net/tracks?trackIds=${encodeURIComponent(trackId)}`, {
        headers: {
            Authorization: `OAuth ${state.token}`,
            "Accept-Language": "ru"
        }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const body = await response.json() as TracksResponse;
    const artists = body.result?.[0]?.artists ?? [];
    const firstId = String(artists[0]?.id ?? "");

    return {
        names: artists.map(artist => String(artist.name ?? "")).filter(Boolean).join(", "),
        url: firstId ? `https://music.yandex.ru/artist/${firstId}` : ""
    };
}

function rememberArtists(trackId: string, artists: TrackArtists): void {
    artistCache.set(trackId, artists);
    while (artistCache.size > MAX_ARTIST_CACHE_ENTRIES) {
        artistCache.delete(artistCache.keys().next().value as string);
    }
}

export function resolveArtists(trackId: string): void {
    if (!trackId || !state.token || artistCache.has(trackId) || artistLookups.has(trackId)) return;
    artistLookups.add(trackId);

    void fetchArtists(trackId)
        .then(artists => {
            rememberArtists(trackId, artists);
            if (state.lastSnapshot?.trackId !== trackId) return;
            emitSnapshot({
                ...state.lastSnapshot,
                artists: artists.names,
                artistUrl: artists.url,
                artistsResolved: true
            });
        })
        .catch(error => {
            rememberArtists(trackId, { names: "", url: "" });
            log(`Artist lookup failed: ${errorMessage(error)}`);
            if (state.lastSnapshot?.trackId === trackId) {
                emitSnapshot({ ...state.lastSnapshot, artistsResolved: true });
            }
        })
        .finally(() => artistLookups.delete(trackId));
}

export function absoluteCoverUrl(value: unknown): string {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    if (raw.startsWith("//")) return `https:${raw}`;
    if (raw.startsWith("http://")) return `https://${raw.slice("http://".length)}`;
    if (raw.startsWith("https://")) return raw;
    return `https://${raw}`;
}

export function repeatFromYnison(value: unknown): RepeatMode {
    switch (String(value ?? "NONE").toUpperCase()) {
        case "ONE": return "one";
        case "CONTEXT":
        case "ALL": return "context";
        default: return "off";
    }
}

export function targetDevice(ynisonState: YnisonState): YnisonDevice | null {
    const devices = ynisonState.devices ?? [];
    const byId = (id: string) => (id ? devices.find(device => device.info?.device_id === id) ?? null : null);
    return byId(ynisonState.active_device_id_optional ?? "")
        ?? byId(state.selectedDeviceId)
        ?? devices.find(device =>
            device.info?.device_id !== state.deviceId
            && device.capabilities?.can_be_player !== false) ?? null;
}

export function deviceVolume(device: YnisonDevice | null): number {
    const raw = device?.volume_info?.volume ?? device?.volume ?? 0;
    if (!Number.isFinite(raw)) return 0;
    return Math.min(1, Math.max(0, raw > 1 ? raw / 100 : raw));
}

function remoteDevices(devices: YnisonDevice[]): PlayerDevice[] {
    const byTitle = new Map<string, PlayerDevice>();

    for (const device of devices) {
        const id = String(device.info?.device_id ?? "");
        if (!id || id === state.deviceId || device.is_shadow) continue;

        const entry = {
            id,
            title: String(device.info?.title ?? device.info?.app_name ?? id),
            canBePlayer: device.capabilities?.can_be_player !== false
        };

        const existing = byTitle.get(entry.title);
        const preferred = !existing
            || id === state.selectedDeviceId
            || (!existing.canBePlayer && entry.canBePlayer);

        if (preferred && existing?.id !== state.selectedDeviceId) byTitle.set(entry.title, entry);
    }

    const ynison = [...byTitle.values()];

    const stations = state.stations.map(station => ({
        id: `${STATION_PREFIX}${station.deviceId}`,
        title: station.name || station.deviceId,
        canBePlayer: true
    }));

    return [...ynison, ...stations];
}

export function mapStateToSnapshot(ynisonState: YnisonState): PlayerSnapshot {
    const queue = ynisonState.player_state?.player_queue;
    const status = ynisonState.player_state?.status;
    const list = Array.isArray(queue?.playable_list) ? queue.playable_list : [];
    const index = Number.isInteger(queue?.current_playable_index) ? queue.current_playable_index : -1;
    const current = index >= 0 ? list[index] : undefined;
    const trackId = String(current?.playable_id ?? "");
    const device = targetDevice(ynisonState);
    const activeDeviceId = String(device?.info?.device_id ?? "");
    const volume = deviceVolume(device);

    return {
        trackId,
        title: String(current?.title ?? ""),
        artists: artistCache.get(trackId)?.names ?? "",
        artistUrl: artistCache.get(trackId)?.url ?? "",
        artistsResolved: !trackId || artistCache.has(trackId),
        album: String(current?.album_title_optional ?? ""),
        coverUrl: absoluteCoverUrl(current?.cover_url_optional),
        positionMs: Number(status?.progress_ms ?? 0),
        durationMs: Number(status?.duration_ms ?? 0),
        isPlaying: !(status?.paused ?? true),
        shuffle: Boolean(queue?.shuffle_optional),
        repeat: repeatFromYnison(queue?.options?.repeat_mode),
        volume,
        devices: remoteDevices(ynisonState.devices ?? []),
        activeDeviceId,
        activeDeviceName: String(device?.info?.title ?? device?.info?.app_name ?? "")
    };
}
