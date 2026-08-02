/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const PROTOCOL_VERSION = 1 as const;

export type RepeatMode = "off" | "context" | "one";
export type ProtocolMode = "unknown" | "v1" | "legacy";
export type ThemeMode = "custom" | "discord" | "cover";
export type Language = "en" | "ru";

export interface ArtistLink {
    name: string;
    url: string;
}

export interface LyricLine {
    text: string;
    startMs?: number;
}

export interface QueueItem {
    id: string;
    trackId: string;
    title: string;
    artists: string[];
    artistLinks: ArtistLink[];
    album: string;
    coverUrl: string;
    trackUrl: string;
    durationMs: number;
}

export interface PlayerSnapshot {
    trackId: string;
    title: string;
    artists: string[];
    artistLinks: ArtistLink[];
    album: string;
    albumUrl: string;
    year: string;
    quality: string;
    coverUrl: string;
    trackUrl: string;
    accentColor: string;
    colorAddonActive: boolean;
    lyrics: string;
    lyricLines: LyricLine[];
    positionMs: number;
    durationMs: number;
    isPlaying: boolean;
    shuffle: boolean;
    repeat: RepeatMode;
    liked: boolean;
    muted: boolean;
    volume: number;
    isVibe: boolean;
    queue: QueueItem[];
    queueIndex: number;
    queueCanPlay: boolean;
    queueCanRemove: boolean;
    queueCanMove: boolean;
    updatedAt: number;
}

export interface BridgeStatus {
    running: boolean;
    host: string;
    port: number;
    clientCount: number;
    lastError: string | null;
    version: string;
}

export type BridgeEvent =
    | { type: "connected"; clientId: string; at: number; }
    | { type: "disconnected"; clientId: string; reason: string; at: number; }
    | { type: "message"; clientId: string; data: string; at: number; }
    | { type: "error"; message: string; at: number; };

export type RendererToPulseMessage =
    | { type: "request"; request: "snapshot"; id?: string; }
    | {
        type: "command";
        command:
        | "playPause"
        | "previous"
        | "next"
        | "toggleShuffle"
        | "cycleRepeat"
        | "toggleLike"
        | "toggleMute"
        | "startTrackVibe"
        | "seek"
        | "setVolume"
        | "playQueueItem"
        | "removeQueueItem"
        | "moveQueueItem";
        value?: number | boolean;
        queueItemId?: string;
        trackId?: string;
        index?: number;
        fromIndex?: number;
        toIndex?: number;
    };

export type PulseToRendererMessage =
    | {
        type: "hello";
        protocol: number;
        client: string;
        version?: string;
        capabilities?: string[];
    }
    | { type: "snapshot"; protocol?: number; state: Partial<PlayerSnapshot>; id?: string; }
    | { type: "error"; message: string; };
