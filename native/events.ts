/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PlayerSnapshot, YnisonEvent, YnisonStatus } from "../types";
import { MAX_EVENTS } from "./constants";
import { state } from "./state";

const eventQueue: YnisonEvent[] = [];
// The renderer keeps exactly one long-poll invoke open, so a single waiter slot is enough.
let eventWaiter: ((events: YnisonEvent[]) => void) | null = null;

export function enqueue(event: YnisonEvent): void {
    eventQueue.push(event);
    if (eventQueue.length > MAX_EVENTS) {
        eventQueue.splice(0, eventQueue.length - MAX_EVENTS);
    }

    if (eventWaiter) {
        const resolve = eventWaiter;
        eventWaiter = null;
        resolve(eventQueue.splice(0, MAX_EVENTS));
    }
}

export function emitSnapshot(snapshot: PlayerSnapshot): void {
    state.lastSnapshot = snapshot;
    enqueue({ type: "snapshot", snapshot, at: Date.now() });
}

export function statusSnapshot(): YnisonStatus {
    return { state: state.connectionState, lastError: state.lastError };
}

export function emitStatus(connectionState: YnisonStatus["state"], error: string | null = null): void {
    state.connectionState = connectionState;
    state.lastError = error;
    enqueue({ type: "status", status: statusSnapshot(), at: Date.now() });
}

export function awaitEvents(timeoutMs: number): Promise<YnisonEvent[]> {
    if (eventQueue.length > 0) return Promise.resolve(eventQueue.splice(0, MAX_EVENTS));

    // A second concurrent poll supersedes the previous one instead of stacking.
    eventWaiter?.([]);

    return new Promise(resolve => {
        const waiter = (events: YnisonEvent[]) => {
            clearTimeout(timer);
            resolve(events);
        };

        const timer = setTimeout(() => {
            if (eventWaiter === waiter) eventWaiter = null;
            resolve([]);
        }, timeoutMs);
        timer.unref();

        eventWaiter = waiter;
    });
}
