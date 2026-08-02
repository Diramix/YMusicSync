/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { IpcMainInvokeEvent } from "electron";

import type { CommandPayload, PlayerCommand, YnisonEvent, YnisonStatus } from "../types";
import { runCommand } from "./commands";
import { closeConnection, openConnection } from "./connection";
import { resolveCoverDataUrl } from "./covers";
import { awaitEvents, emitStatus, statusSnapshot } from "./events";
import { queueConnectionOperation, state } from "./state";

function clampInt(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(Math.max(min, Math.trunc(value)), max);
}

export function connect(_: IpcMainInvokeEvent, rawToken: string): Promise<YnisonStatus> {
    const nextToken = String(rawToken ?? "").trim();

    return queueConnectionOperation(async () => {
        if (nextToken === state.token && state.socket?.isOpen) return statusSnapshot();

        closeConnection("Reconnecting");
        state.token = nextToken;
        state.reconnectAttempts = 0;

        if (!state.token) {
            emitStatus("idle", null);
            return statusSnapshot();
        }

        await openConnection();
        return statusSnapshot();
    });
}

export function disconnect(_: IpcMainInvokeEvent): YnisonStatus {
    closeConnection("Disconnected by user");
    state.token = "";
    emitStatus("idle", null);
    return statusSnapshot();
}

export function getStatus(_: IpcMainInvokeEvent): YnisonStatus {
    return statusSnapshot();
}

export function command(_: IpcMainInvokeEvent, name: PlayerCommand, payload: CommandPayload = {}): boolean {
    const value = Number(payload.value);
    return runCommand(name, {
        value: Number.isFinite(value) ? value : undefined,
        deviceId: typeof payload.deviceId === "string" ? payload.deviceId.slice(0, 256) : undefined
    });
}

export function getCoverDataUrl(_: IpcMainInvokeEvent, rawUrl: string): Promise<string> {
    return resolveCoverDataUrl(rawUrl);
}

export function waitForEvents(_: IpcMainInvokeEvent, timeout = 30_000): Promise<YnisonEvent[]> {
    return awaitEvents(clampInt(timeout, 1_000, 120_000, 30_000));
}
