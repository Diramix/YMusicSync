/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import type { PluginNative } from "@utils/types";
import { proxyLazyWebpack } from "@webpack";
import { Flux, FluxDispatcher } from "@webpack/common";

import { settings } from "./settings";
import {
    type ArtistLink,
    type BridgeEvent,
    type BridgeStatus,
    type LyricLine,
    type PlayerSnapshot,
    PROTOCOL_VERSION,
    type ProtocolMode,
    type QueueItem,
    type RendererToPulseMessage,
    type RepeatMode } from "./types";

const logger = new Logger("YMControls", "#ffcc00");
const VOLUME_COMMAND_SETTLE_MS = 6500;
const Native = VencordNative.pluginHelpers.YMControls as PluginNative<typeof import("./native")> | undefined;
const LEGACY_REQUESTS = [
    "currentTime",
    "endTime",
    "coverImage",
    "vibeState",
    "repeatState",
    "shuffleState",
    "likeState",
    "playingState",
    "volumeState"
] as const;

function finiteNumber(value: unknown, fallback: number): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function stringValue(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function normalizeRepeat(value: unknown, fallback: RepeatMode): RepeatMode {
    switch (value) {
        case "off":
        case "none":
            return "off";
        case "context":
            return "context";
        case "one":
        case "track":
            return "one";
        default:
            return fallback;
    }
}

function normalizeArtists(value: unknown, fallback: string[]): string[] {
    if (Array.isArray(value)) {
        const artists = value
            .map(artist => typeof artist === "string"
                ? artist
                : artist && typeof artist === "object" && "name" in artist
                    ? String(artist.name)
                    : "")
            .map(artist => artist.trim())
            .filter(Boolean);
        if (artists.length) return artists;
    }

    if (typeof value === "string" && value.trim()) {
        return value.split(/\s*,\s*/).filter(Boolean);
    }

    return fallback;
}

function normalizeArtistLinks(value: unknown, fallback: ArtistLink[]): ArtistLink[] {
    if (!Array.isArray(value)) return fallback;

    const links = value
        .map(link => ({
            name: typeof link === "object" && link && "name" in link ? String((link as any).name).trim() : "",
            url: typeof link === "object" && link && "url" in link ? String((link as any).url).trim() : ""
        }))
        .filter(link => link.name && link.url);

    return links;
}

function normalizeLyricLines(value: unknown, fallback: LyricLine[]): LyricLine[] {
    if (!Array.isArray(value)) return fallback;

    const lines = value
        .map(line => {
            if (typeof line === "string") return { text: line.trim() };
            if (!line || typeof line !== "object") return null;

            const record = line as Record<string, unknown>;
            const text = stringValue(record.text, stringValue(record.line, stringValue(record.value))).trim();
            if (!text) return null;

            const rawStart = record.startMs ?? record.startTimeMs ?? record.timeMs ?? record.timestampMs;
            const startMs = Number(rawStart);
            return Number.isFinite(startMs) && startMs >= 0
                ? { text, startMs: Math.round(startMs) }
                : { text };
        })
        .filter((line): line is LyricLine => Boolean(line));

    return lines;
}

function normalizeQueue(value: unknown, fallback: QueueItem[]): QueueItem[] {
    if (!Array.isArray(value)) return fallback;

    const items = value
        .map((item, index): QueueItem | null => {
            if (!item || typeof item !== "object") return null;
            const record = item as Record<string, unknown>;
            const title = stringValue(record.title).trim();
            if (!title) return null;

            const trackId = stringValue(record.trackId, stringValue(record.id)).trim();
            return {
                id: stringValue(record.id, `${trackId || title}:${index}`),
                trackId,
                title,
                artists: normalizeArtists(record.artists, []),
                artistLinks: normalizeArtistLinks(record.artistLinks, []),
                album: stringValue(record.album),
                coverUrl: stringValue(record.coverUrl),
                trackUrl: stringValue(record.trackUrl),
                durationMs: Math.max(0, Math.round(finiteNumber(record.durationMs, 0)))
            };
        })
        .filter((item): item is QueueItem => Boolean(item));

    return items;
}

function emptySnapshot(): PlayerSnapshot {
    return {
        trackId: "",
        title: "Яндекс Музыка",
        artists: ["Яндекс Музыка"],
        artistLinks: [],
        album: "",
        albumUrl: "",
        year: "",
        quality: "",
        coverUrl: "",
        trackUrl: "",
        accentColor: "",
        colorAddonActive: false,
        lyrics: "",
        lyricLines: [],
        positionMs: 0,
        durationMs: 0,
        isPlaying: false,
        shuffle: false,
        repeat: "off",
        liked: false,
        muted: false,
        volume: 100,
        isVibe: false,
        queue: [],
        queueIndex: -1,
        queueCanPlay: false,
        queueCanRemove: false,
        queueCanMove: false,
        updatedAt: Date.now()
    };
}

export const PulseSyncStore = proxyLazyWebpack(() => {
    const { Store } = Flux;

    class PulseSyncBridgeStore extends Store {
        public connected = false;
        public serverRunning = false;
        public serverStatus: BridgeStatus | null = null;
        public lastError: string | null = null;
        public clientId: string | null = null;
        public protocolMode: ProtocolMode = "unknown";
        public snapshot: PlayerSnapshot | null = null;
        public lastMessageAt = 0;
        public addonVersion = "";
        public capabilities: string[] = [];

        private active = false;
        private pollTimer: number | null = null;
        private snapshotTimer: number | null = null;
        private refreshTimer: number | null = null;
        private pollInFlight = false;
        private requestCounter = 0;
        private pendingVolumeTarget: number | null = null;
        private pendingVolumeAt = 0;
        private positionAnchorMs = 0;
        private positionAnchorAt = Date.now();

        public get positionMs(): number {
            if (!this.snapshot) return 0;

            let position = this.positionAnchorMs;
            if (this.snapshot.isPlaying) {
                position += Date.now() - this.positionAnchorAt;
            }

            if (this.snapshot.durationMs > 0) {
                position = Math.min(position, this.snapshot.durationMs);
            }
            return Math.max(0, position);
        }

        public async start(): Promise<void> {
            if (this.active) return;
            this.active = true;
            this.lastError = null;
            this.emitChange();

            try {
                if (!Native) {
                    throw new Error(
                        "Native helper YMControls не найден. Выполни pnpm build, затем pnpm inject и полностью перезапусти Discord."
                    );
                }

                logger.info(`Starting local bridge on 127.0.0.1:${settings.store.port}...`);
                const status = await Native.startServer(settings.store.port);
                if (!this.active) return;

                this.serverStatus = status;
                this.serverRunning = status.running;
                this.lastError = status.lastError;
                logger.info("Bridge status:", status);
                this.emitChange();
            } catch (error) {
                if (!this.active) return;
                this.serverRunning = false;
                this.lastError = error instanceof Error ? error.message : String(error);
                logger.error("Bridge start failed:", error);
                this.emitChange();
            }

            if (!this.active) return;
            this.pollTimer = window.setInterval(() => void this.pollEvents(), 100);
            this.snapshotTimer = window.setInterval(
                () => void this.requestState(),
                Math.max(250, Number(settings.store.pollInterval) || 1000)
            );
            await this.pollEvents();
        }

        public async stop(): Promise<void> {
            this.active = false;
            if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
            if (this.snapshotTimer !== null) window.clearInterval(this.snapshotTimer);
            if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
            this.pollTimer = null;
            this.snapshotTimer = null;
            this.refreshTimer = null;

            try {
                if (Native) this.serverStatus = await Native.stopServer();
            } catch (error) {
                this.lastError = error instanceof Error ? error.message : String(error);
                logger.error("Bridge stop failed:", error);
            }

            this.serverRunning = false;
            this.connected = false;
            this.clientId = null;
            this.pendingVolumeTarget = null;
            this.pendingVolumeAt = 0;
            this.protocolMode = "unknown";
            this.addonVersion = "";
            this.capabilities = [];
            this.emitChange();
        }

        public async restart(): Promise<void> {
            await this.stop();
            await this.start();
        }

        public async logDiagnostics(): Promise<BridgeStatus | null> {
            const diagnostics = {
                nativeHelperAvailable: Boolean(Native),
                configuredPort: settings.store.port,
                active: this.active,
                connected: this.connected,
                clientId: this.clientId,
                protocolMode: this.protocolMode,
                addonVersion: this.addonVersion,
                capabilities: this.capabilities,
                queueLength: this.snapshot?.queue.length ?? 0,
                rendererStatus: this.serverStatus,
                rendererError: this.lastError
            };

            if (!Native) {
                logger.error("Diagnostics:", diagnostics);
                return null;
            }

            try {
                const status = await Native.getStatus();
                logger.info("Diagnostics:", { ...diagnostics, nativeStatus: status });
                return status;
            } catch (error) {
                logger.error("Diagnostics failed:", diagnostics, error);
                return null;
            }
        }

        public async requestState(): Promise<void> {
            if (!this.active || !this.connected || !this.clientId) return;

            if (this.protocolMode !== "legacy") {
                await this.send({
                    type: "request",
                    request: "snapshot",
                    id: `ymcontrols-${++this.requestCounter}`
                });
            }

            if (this.protocolMode !== "v1") {
                await Promise.all(LEGACY_REQUESTS.map(request => this.sendLegacy(request)));
            }
        }

        public playPause(): void {
            const nextPlaying = !(this.snapshot?.isPlaying ?? false);
            this.optimistic({ isPlaying: nextPlaying });

            if (this.protocolMode === "v1") {
                void this.send({ type: "command", command: "playPause" });
            } else {
                void this.sendLegacy("playerInteraction");
            }
            this.refreshSoon();
        }

        public previous(): void {
            if (this.protocolMode === "v1") {
                void this.send({ type: "command", command: "previous" });
            } else {
                void this.sendLegacy("track", { message: -1 });
            }
            this.refreshSoon(300);
        }

        public next(): void {
            if (this.protocolMode === "v1") {
                void this.send({ type: "command", command: "next" });
            } else {
                void this.sendLegacy("track", { message: 1 });
            }
            this.refreshSoon(300);
        }

        public toggleShuffle(): void {
            this.optimistic({ shuffle: !(this.snapshot?.shuffle ?? false) });
            if (this.protocolMode === "v1") {
                void this.send({ type: "command", command: "toggleShuffle" });
            } else {
                void this.sendLegacy("shuffleInteraction");
            }
            this.refreshSoon();
        }

        public cycleRepeat(): void {
            const current = this.snapshot?.repeat ?? "off";
            const next: RepeatMode = current === "off" ? "context" : current === "context" ? "one" : "off";
            this.optimistic({ repeat: next });
            if (this.protocolMode === "v1") {
                void this.send({ type: "command", command: "cycleRepeat" });
            } else {
                void this.sendLegacy("repeatInteraction");
            }
            this.refreshSoon();
        }

        public toggleLike(): void {
            const nextLiked = !(this.snapshot?.liked ?? false);
            this.optimistic({ liked: nextLiked });
            if (this.protocolMode === "v1") {
                void this.send({ type: "command", command: "toggleLike", value: nextLiked });
            } else {
                // Old add-ons treat likeInteraction as a click on the heart,
                // while 3.0.5+ also reads the explicit target state.
                void this.sendLegacy("likeInteraction", { liked: nextLiked });
            }
            this.refreshSoon();
        }

        public toggleMute(): void {
            const nextMuted = !(this.snapshot?.muted ?? false);
            this.optimistic({ muted: nextMuted });
            if (this.protocolMode === "v1") {
                void this.send({ type: "command", command: "toggleMute" });
            } else {
                void this.sendLegacy("muteInteraction");
            }
            this.refreshSoon();
        }

        public startTrackVibe(): void {
            if (this.protocolMode === "v1") {
                void this.send({ type: "command", command: "startTrackVibe" });
            } else {
                void this.sendLegacy("trackVibeInteraction");
            }
            this.refreshSoon(600);
        }

        public seek(positionMs: number): void {
            const duration = this.snapshot?.durationMs ?? 0;
            const target = clamp(Math.round(positionMs), 0, duration > 0 ? duration : Number.MAX_SAFE_INTEGER);
            const previous = this.positionMs;
            this.optimistic({ positionMs: target });

            if (this.protocolMode === "v1") {
                void this.send({ type: "command", command: "seek", value: target });
            } else {
                const deltaSeconds = Math.round(Math.abs(target - previous) / 1000);
                if (deltaSeconds > 0) {
                    void this.sendLegacy("time", {
                        message: deltaSeconds,
                        how: target >= previous ? 1 : 0
                    });
                }
            }
            this.refreshSoon();
        }

        public setVolume(volume: number): void {
            const target = clamp(Math.round(volume), 0, 100);
            const previous = this.snapshot?.volume ?? 100;
            this.pendingVolumeTarget = target;
            this.pendingVolumeAt = Date.now();
            this.optimistic({ volume: target, muted: target === 0 });

            if (this.protocolMode === "v1") {
                void this.send({ type: "command", command: "setVolume", value: target });
            } else {
                const step = Math.abs(target - previous) / 100;
                if (step > 0) {
                    void this.sendLegacy("volume", {
                        message: step,
                        how: target >= previous ? 1 : 2
                    });
                }
            }
            this.refreshSoon();
        }

        public playQueueItem(item: QueueItem, index: number): void {
            if (this.protocolMode !== "v1") return;
            void this.send({
                type: "command",
                command: "playQueueItem",
                queueItemId: item.id,
                trackId: item.trackId,
                index
            });
            this.refreshSoon(400);
        }

        public removeQueueItem(item: QueueItem, index: number): void {
            if (this.protocolMode !== "v1") return;
            void this.send({
                type: "command",
                command: "removeQueueItem",
                queueItemId: item.id,
                trackId: item.trackId,
                index
            });
            this.refreshSoon(350);
        }

        public moveQueueItem(item: QueueItem, fromIndex: number, toIndex: number): void {
            const queue = this.snapshot?.queue ?? [];
            if (this.protocolMode !== "v1" || toIndex < 0 || toIndex >= queue.length || fromIndex === toIndex) return;

            const nextQueue = [...queue];
            const [moved] = nextQueue.splice(fromIndex, 1);
            nextQueue.splice(toIndex, 0, moved);
            const currentIndex = this.snapshot?.queueIndex ?? -1;
            let nextCurrentIndex = currentIndex;
            if (currentIndex === fromIndex) nextCurrentIndex = toIndex;
            else if (fromIndex < currentIndex && toIndex >= currentIndex) nextCurrentIndex--;
            else if (fromIndex > currentIndex && toIndex <= currentIndex) nextCurrentIndex++;
            this.optimistic({ queue: nextQueue, queueIndex: nextCurrentIndex });

            void this.send({
                type: "command",
                command: "moveQueueItem",
                queueItemId: item.id,
                trackId: item.trackId,
                fromIndex,
                toIndex
            });
            this.refreshSoon(400);
        }

        private async pollEvents(): Promise<void> {
            if (!this.active || this.pollInFlight || !Native) return;
            this.pollInFlight = true;

            try {
                const events = await Native.drainEvents(250);
                if (!this.active) return;
                for (const event of events) this.handleBridgeEvent(event);

                if (events.length === 250) {
                    window.setTimeout(() => void this.pollEvents(), 0);
                }
            } catch (error) {
                this.lastError = error instanceof Error ? error.message : String(error);
                this.emitChange();
            } finally {
                this.pollInFlight = false;
            }
        }

        private handleBridgeEvent(event: BridgeEvent): void {
            switch (event.type) {
                case "connected":
                    logger.info(`Pulse Sync connected as ${event.clientId}.`);
                    this.clientId = event.clientId;
                    this.connected = true;
                    this.protocolMode = "unknown";
                    this.lastError = null;
                    this.lastMessageAt = event.at;
                    this.emitChange();
                    void this.sendLegacy("device");
                    void this.requestState();
                    break;

                case "disconnected":
                    logger.warn(`Pulse Sync disconnected: ${event.reason}`);
                    if (event.clientId !== this.clientId) return;
                    this.connected = false;
                    this.clientId = null;
                    this.pendingVolumeTarget = null;
                    this.pendingVolumeAt = 0;
                    this.protocolMode = "unknown";
                    this.addonVersion = "";
                    this.capabilities = [];
                    this.emitChange();
                    break;

                case "message":
                    if (event.clientId !== this.clientId) return;
                    this.lastMessageAt = event.at;
                    this.handleMessage(event.data);
                    break;

                case "error":
                    this.lastError = event.message;
                    this.emitChange();
                    break;
            }
        }

        private handleMessage(raw: string): void {
            let message: any;
            try {
                message = JSON.parse(raw);
            } catch {
                this.lastError = "YMControls add-on sent invalid JSON.";
                this.emitChange();
                return;
            }

            if (message?.type === "hello") {
                this.protocolMode = "v1";
                this.addonVersion = typeof message.version === "string" ? message.version : "";
                this.capabilities = Array.isArray(message.capabilities)
                    ? message.capabilities.map(String).filter(Boolean)
                    : [];
                if (Number(message.protocol) !== PROTOCOL_VERSION) {
                    this.lastError = `Protocol ${message.protocol} is not fully supported (expected ${PROTOCOL_VERSION}).`;
                }
                this.emitChange();
                return;
            }

            if (message?.type === "snapshot" && message.state && typeof message.state === "object") {
                this.protocolMode = "v1";
                this.applySnapshot(message.state);
                return;
            }

            if (message?.type === "error") {
                this.lastError = String(message.message ?? "Unknown YMControls error");
                logger.warn(this.lastError);
                this.emitChange();
                return;
            }

            if (this.protocolMode !== "v1"
                && typeof message?.request === "string"
                && Object.prototype.hasOwnProperty.call(message, "response")) {
                this.protocolMode = "legacy";
                this.applyLegacyResponse(message.request, message.response);
            }
        }

        private applySnapshot(raw: Record<string, unknown>): void {
            const previous = this.snapshot ?? emptySnapshot();
            const durationMs = Math.max(0, Math.round(finiteNumber(raw.durationMs, previous.durationMs)));
            let positionMs = Math.max(0, Math.round(finiteNumber(raw.positionMs, previous.positionMs)));
            if (durationMs > 0) positionMs = Math.min(positionMs, durationMs);

            const hasReportedVolume = Object.prototype.hasOwnProperty.call(raw, "volume")
                && Number.isFinite(Number(raw.volume));
            const reportedVolume = clamp(Math.round(finiteNumber(raw.volume, previous.volume)), 0, 100);
            let volume = reportedVolume;
            let keepPendingVolume = false;

            if (this.pendingVolumeTarget !== null) {
                const target = this.pendingVolumeTarget;
                const pendingAge = Date.now() - this.pendingVolumeAt;
                if (hasReportedVolume && Math.abs(reportedVolume - target) <= 1) {
                    this.pendingVolumeTarget = null;
                    this.pendingVolumeAt = 0;
                } else if (pendingAge <= VOLUME_COMMAND_SETTLE_MS) {
                    volume = target;
                    keepPendingVolume = true;
                } else {
                    this.pendingVolumeTarget = null;
                    this.pendingVolumeAt = 0;
                }
            }

            const queue = normalizeQueue(raw.queue, previous.queue);
            const rawQueueIndex = Math.trunc(finiteNumber(raw.queueIndex, previous.queueIndex));
            const queueIndex = queue.length
                ? clamp(rawQueueIndex, -1, queue.length - 1)
                : -1;

            const snapshot: PlayerSnapshot = {
                trackId: typeof raw.trackId === "string" ? raw.trackId : previous.trackId,
                title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : previous.title,
                artists: normalizeArtists(raw.artists ?? raw.artist, previous.artists),
                artistLinks: normalizeArtistLinks(raw.artistLinks, previous.artistLinks),
                album: stringValue(raw.album, previous.album),
                albumUrl: stringValue(raw.albumUrl, previous.albumUrl),
                year: stringValue(raw.year, previous.year),
                quality: stringValue(raw.quality, previous.quality),
                coverUrl: stringValue(raw.coverUrl, previous.coverUrl),
                trackUrl: stringValue(raw.trackUrl, previous.trackUrl),
                accentColor: stringValue(raw.accentColor, previous.accentColor),
                colorAddonActive: typeof raw.colorAddonActive === "boolean"
                    ? raw.colorAddonActive
                    : false,
                lyrics: stringValue(raw.lyrics, previous.lyrics),
                lyricLines: normalizeLyricLines(raw.lyricLines, previous.lyricLines),
                positionMs,
                durationMs,
                isPlaying: typeof raw.isPlaying === "boolean" ? raw.isPlaying : previous.isPlaying,
                shuffle: typeof raw.shuffle === "boolean" ? raw.shuffle : previous.shuffle,
                repeat: normalizeRepeat(raw.repeat, previous.repeat),
                liked: typeof raw.liked === "boolean" ? raw.liked : previous.liked,
                muted: keepPendingVolume
                    ? volume === 0
                    : typeof raw.muted === "boolean" ? raw.muted : previous.muted,
                volume,
                isVibe: typeof raw.isVibe === "boolean" ? raw.isVibe : previous.isVibe,
                queue,
                queueIndex,
                queueCanPlay: typeof raw.queueCanPlay === "boolean" ? raw.queueCanPlay : previous.queueCanPlay,
                queueCanRemove: typeof raw.queueCanRemove === "boolean" ? raw.queueCanRemove : previous.queueCanRemove,
                queueCanMove: typeof raw.queueCanMove === "boolean" ? raw.queueCanMove : previous.queueCanMove,
                updatedAt: Date.now()
            };

            this.snapshot = snapshot;
            this.positionAnchorMs = snapshot.positionMs;
            this.positionAnchorAt = Date.now();
            this.lastError = null;
            this.emitChange();
        }

        private applyLegacyResponse(request: string, response: unknown): void {
            const previous = this.snapshot ?? emptySnapshot();
            const partial: Partial<PlayerSnapshot> = {};

            switch (request) {
                case "currentTime":
                    partial.positionMs = Math.max(0, Math.round(finiteNumber(response, previous.positionMs / 1000) * 1000));
                    break;
                case "endTime":
                    partial.durationMs = Math.max(0, Math.round(finiteNumber(response, previous.durationMs / 1000) * 1000));
                    break;
                case "coverImage": {
                    const cover = typeof response === "string" ? response : "";
                    partial.coverUrl = cover.replace(/^http:/, "https:");
                    break;
                }
                case "vibeState":
                    partial.isVibe = Boolean(Number(response));
                    break;
                case "repeatState":
                    partial.repeat = Number(response) === 1 ? "context" : Number(response) === 2 ? "one" : "off";
                    break;
                case "shuffleState":
                    partial.shuffle = Boolean(Number(response));
                    break;
                case "likeState":
                    partial.liked = Boolean(response);
                    break;
                case "playingState":
                    partial.isPlaying = Number(response) === 0;
                    break;
                case "volumeState": {
                    const nextVolume = clamp(Math.round(finiteNumber(response, previous.volume / 100) * 100), 0, 100);
                    partial.volume = nextVolume;
                    partial.muted = nextVolume === 0;
                    break;
                }
                default:
                    return;
            }

            this.applySnapshot(partial as Record<string, unknown>);
        }

        private optimistic(partial: Partial<PlayerSnapshot>): void {
            const next = { ...(this.snapshot ?? emptySnapshot()), ...partial, updatedAt: Date.now() };
            this.snapshot = next;
            this.positionAnchorMs = next.positionMs;
            this.positionAnchorAt = Date.now();
            this.emitChange();
        }

        private async send(message: RendererToPulseMessage): Promise<boolean> {
            if (!this.clientId || !Native) return false;
            try {
                return await Native.sendMessage(this.clientId, JSON.stringify(message));
            } catch (error) {
                this.lastError = error instanceof Error ? error.message : String(error);
                this.emitChange();
                return false;
            }
        }

        private async sendLegacy(request: string, extra: Record<string, unknown> = {}): Promise<boolean> {
            if (!this.clientId || !Native) return false;
            try {
                return await Native.sendMessage(this.clientId, JSON.stringify({ request, ...extra }));
            } catch (error) {
                this.lastError = error instanceof Error ? error.message : String(error);
                this.emitChange();
                return false;
            }
        }

        private refreshSoon(delay = 150): void {
            if (this.refreshTimer !== null) {
                window.clearTimeout(this.refreshTimer);
            }

            this.refreshTimer = window.setTimeout(() => {
                this.refreshTimer = null;
                void this.requestState();
            }, delay);
        }
    }

    return new PulseSyncBridgeStore(FluxDispatcher, {});
});
