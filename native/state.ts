/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PlayerSnapshot, StationEntry, YnisonState, YnisonStatus } from "../types";
import type { YnisonSocket } from "./ynisonSocket";

export const state = {
    socket: null as YnisonSocket | null,
    connectionState: "idle" as YnisonStatus["state"],
    lastError: null as string | null,
    token: "",
    lastState: null as YnisonState | null,
    lastSnapshot: null as PlayerSnapshot | null,
    mutedVolume: 0,
    selectedDeviceId: "",
    deviceId: "",
    reconnectTimer: null as NodeJS.Timeout | null,
    reconnectAttempts: 0,
    connectionGeneration: 0,
    stationToken: "",
    stations: [] as StationEntry[],
    activeStationId: ""
};

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function log(message: string): void {
    console.warn(`[YMusicSync/native] ${message}`);
}

let connectionOperation: Promise<unknown> = Promise.resolve();

export function queueConnectionOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = connectionOperation.then(operation, operation);
    connectionOperation = result.then(() => undefined, () => undefined);
    return result;
}
