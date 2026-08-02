/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { app } from "electron";

import type { YnisonVersion } from "../types";
import { CLIENT_NAME, CLIENT_VERSION } from "./constants";
import { errorMessage, log, state } from "./state";

function deviceIdPath(): string {
    return join(app.getPath("userData"), "ymusicsync-device.json");
}

export function getDeviceId(): string {
    if (state.deviceId) return state.deviceId;

    const path = deviceIdPath();
    try {
        const stored = JSON.parse(readFileSync(path, "utf8"));
        if (typeof stored?.deviceId === "string" && stored.deviceId.length > 0) {
            state.deviceId = stored.deviceId;
            return state.deviceId;
        }
    } catch {
    }

    state.deviceId = randomUUID();
    try {
        writeFileSync(path, JSON.stringify({ deviceId: state.deviceId }), "utf8");
    } catch (error) {
        log(`Could not persist device id: ${errorMessage(error)}`);
    }
    return state.deviceId;
}

export function deviceInfo() {
    return {
        app_name: CLIENT_NAME,
        app_version: CLIENT_VERSION,
        title: CLIENT_NAME,
        device_id: getDeviceId(),
        type: "WEB"
    };
}

// Ynison orders writes by (timestamp_ms, version) over the whole int64 range.
// A small counter always loses the compare against a real player.
export function newVersion(): YnisonVersion {
    return {
        device_id: getDeviceId(),
        version: Math.floor(Math.random() * 0x8000000000000000),
        timestamp_ms: Date.now()
    };
}
