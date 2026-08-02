/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { CommandPayload, PlayerCommand } from "../types";
import { wrapRequest } from "./connection";
import { REPEAT_CYCLE, REPEAT_TO_YNISON } from "./constants";
import { isSelfDevice, newVersion } from "./device";
import { emitSnapshot } from "./events";
import { deviceVolume, mapStateToSnapshot, repeatFromYnison, targetDevice } from "./mapping";
import { state } from "./state";
import { isStationSelected, releaseStation, runStationCommand, selectStation } from "./station";
import { STATION_PREFIX } from "./station/constants";

function pushPlayingStatus(): void {
    if (!state.socket?.isOpen || !state.lastState) return;
    state.lastState.player_state.status.version = newVersion();
    state.socket.send(wrapRequest({
        update_playing_status: { playing_status: state.lastState.player_state.status }
    }));
}

function pushPlayerState(): void {
    if (!state.socket?.isOpen || !state.lastState) return;
    state.lastState.player_state.player_queue.version = newVersion();
    state.lastState.player_state.status.version = newVersion();
    // Without INTERCEPT_IF_NO_ONE_ACTIVE the real player loses activity and
    // Ynison forces our outgoing status to paused.
    state.socket.send(wrapRequest({
        update_player_state: { player_state: state.lastState.player_state }
    }, "INTERCEPT_IF_NO_ONE_ACTIVE"));
}

function pushVolume(volume: number): void {
    if (!state.socket?.isOpen || !state.lastState) return;

    const device = targetDevice(state.lastState);
    const deviceId = device?.info?.device_id ?? state.lastState.active_device_id_optional;
    if (!deviceId || isSelfDevice(deviceId)) return;

    const volumeInfo = { volume: Math.min(1, Math.max(0, volume)), version: newVersion() };
    if (device) device.volume_info = volumeInfo;

    state.socket.send(wrapRequest({
        update_volume_info: { device_id: deviceId, volume_info: volumeInfo }
    }));
}

function moveQueue(delta: number): void {
    if (!state.lastState) return;

    const queue = state.lastState.player_state.player_queue;
    const size = queue.playable_list?.length ?? 0;
    if (size === 0) return;

    const next = queue.current_playable_index + delta;
    queue.current_playable_index = ((next % size) + size) % size;
    state.lastState.player_state.status.progress_ms = 0;
    state.lastState.player_state.status.paused = false;
    pushPlayerState();
}

export function runCommand(name: PlayerCommand, payload: CommandPayload): boolean {
    if (name === "setActiveDevice") {
        const deviceId = String(payload.deviceId ?? "");
        if (!deviceId || isSelfDevice(deviceId)) return false;

        if (deviceId.startsWith(STATION_PREFIX)) {
            return selectStation(deviceId.slice(STATION_PREFIX.length));
        }
        releaseStation();
    } else if (isStationSelected()) {
        return runStationCommand(name, payload);
    }

    if (!state.socket?.isOpen || !state.lastState) return false;

    const { status, player_queue: queue } = state.lastState.player_state;

    switch (name) {
        case "playPause":
            status.paused = !status.paused;
            pushPlayingStatus();
            break;
        case "next":
            moveQueue(1);
            break;
        case "previous":
            moveQueue(-1);
            break;
        case "seek":
            status.progress_ms = Math.max(0, Math.round(payload.value ?? 0));
            pushPlayingStatus();
            break;
        case "setVolume":
            state.mutedVolume = 0;
            pushVolume(payload.value ?? 0);
            break;
        case "toggleMute": {
            const current = deviceVolume(targetDevice(state.lastState));
            if (current > 0) {
                state.mutedVolume = current;
                pushVolume(0);
            } else {
                pushVolume(state.mutedVolume > 0 ? state.mutedVolume : 0.5);
                state.mutedVolume = 0;
            }
            break;
        }
        case "toggleShuffle":
            queue.shuffle_optional = queue.shuffle_optional ? null : { playable_index: queue.current_playable_index };
            pushPlayerState();
            break;
        case "cycleRepeat": {
            const current = repeatFromYnison(queue.options?.repeat_mode);
            const next = REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(current) + 1) % REPEAT_CYCLE.length];
            queue.options = { ...queue.options, repeat_mode: REPEAT_TO_YNISON[next] };
            pushPlayerState();
            break;
        }
        case "setActiveDevice": {
            const deviceId = String(payload.deviceId ?? "");
            if (!deviceId || isSelfDevice(deviceId)) return false;
            state.selectedDeviceId = deviceId;
            state.selectedDeviceAt = Date.now();
            state.socket.send(wrapRequest({ update_active_device: { device_id_optional: deviceId } }));
            break;
        }
        default:
            return false;
    }

    emitSnapshot(mapStateToSnapshot(state.lastState));
    return true;
}
