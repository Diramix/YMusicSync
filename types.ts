/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type RepeatMode = "off" | "context" | "one";

export type ConnectionState = "idle" | "connecting" | "connected" | "error";

export interface PlayerDevice {
    id: string;
    title: string;
    canBePlayer: boolean;
}

export interface PlayerSnapshot {
    trackId: string;
    title: string;
    artists: string;
    artistUrl: string;
    artistsResolved: boolean;
    album: string;
    coverUrl: string;
    positionMs: number;
    durationMs: number;
    isPlaying: boolean;
    shuffle: boolean;
    repeat: RepeatMode;
    volume: number;
    devices: PlayerDevice[];
    activeDeviceId: string;
    activeDeviceName: string;
}

export interface StationEntry {
    deviceId: string;
    name: string;
    platform: string;
    host: string;
    port: number;
    token: string;
}

export interface YnisonStatus {
    state: ConnectionState;
    lastError: string | null;
}

export type YnisonEvent =
    | { type: "status"; status: YnisonStatus; at: number; }
    | { type: "snapshot"; snapshot: PlayerSnapshot; at: number; }
    | { type: "error"; message: string; at: number; }
    | { type: "log"; message: string; at: number; };

export type PlayerCommand =
    | "playPause"
    | "previous"
    | "next"
    | "seek"
    | "setVolume"
    | "toggleMute"
    | "toggleShuffle"
    | "cycleRepeat"
    | "setActiveDevice";

export interface CommandPayload {
    value?: number;
    deviceId?: string;
}

export interface YnisonVersion {
    device_id: string;
    version: number;
    timestamp_ms: number;
}

export interface YnisonPlayable {
    playable_id?: string;
    playable_type?: string;
    title?: string;
    album_id_optional?: string;
    cover_url_optional?: string;
    album_title_optional?: string;
}

export interface YnisonPlayerQueue {
    current_playable_index: number;
    entity_id?: string;
    entity_type?: string;
    playable_list: YnisonPlayable[];
    options?: { repeat_mode?: string; };
    shuffle_optional?: unknown;
    version?: YnisonVersion;
    [key: string]: unknown;
}

export interface YnisonPlaybackStatus {
    duration_ms: number;
    paused: boolean;
    playback_speed: number;
    progress_ms: number;
    version?: YnisonVersion;
}

export interface YnisonDevice {
    volume?: number;
    volume_info?: { volume: number; version?: YnisonVersion | null; };
    capabilities?: {
        can_be_player?: boolean;
        can_be_remote_controller?: boolean;
        volume_granularity?: number;
    };
    info?: {
        device_id?: string;
        title?: string;
        app_name?: string;
        app_version?: string;
        type?: string;
    };
    is_shadow?: boolean;
}

export interface YnisonPlayerState {
    player_queue: YnisonPlayerQueue;
    status: YnisonPlaybackStatus;
    player_queue_inject_optional?: unknown;
}

export interface YnisonState {
    player_state: YnisonPlayerState;
    devices: YnisonDevice[];
    active_device_id_optional: string;
}
