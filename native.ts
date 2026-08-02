/*
 * Minimal loopback-only RFC 6455 WebSocket server for the Vencord/Equicord main process.
 * No third-party dependency is required.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import {
    createServer,
    type IncomingMessage,
    type Server,
    type ServerResponse
} from "node:http";
import type { Socket } from "node:net";

import { net, type IpcMainInvokeEvent } from "electron";

import type { BridgeEvent, BridgeStatus } from "./types";

const BRIDGE_NAME = "YMControls";
const BRIDGE_VERSION = "3.0.24";
const HOST = "127.0.0.1";
const DEFAULT_PORT = 24891;
const ACCEPTED_PATHS = new Set(["/", "/ymcontrols", "/pulsesync"]);
const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_MESSAGE_BYTES = 1024 * 1024;
const MAX_EVENTS = 500;
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const COVER_FETCH_TIMEOUT_MS = 10_000;
const MAX_COVER_REDIRECTS = 3;
const COVER_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const YANDEX_COVER_HOSTS = new Set([
    "avatars.yandex.net",
    "avatars.mds.yandex.net"
]);
const ALLOWED_COVER_HOSTS = new Set([
    ...YANDEX_COVER_HOSTS,
    "i.postimg.cc"
]);
const YANDEX_COVER_SIZE = "400x400";

interface DownloadedCover {
    body: Buffer;
    contentType: string;
}

interface ClientConnection {
    id: string;
    socket: Socket;
    buffer: Buffer;
    fragmentOpcode: number | null;
    fragments: Buffer[];
    fragmentBytes: number;
}

let server: Server | null = null;
let activePort = 0;
let lastError: string | null = null;
let nextClientId = 1;
let serverOperation: Promise<void> = Promise.resolve();

const clients = new Map<string, ClientConnection>();
const eventQueue: BridgeEvent[] = [];
const coverDataUrlCache = new Map<string, string>();
const MAX_COVER_DATA_URL_CACHE_ENTRIES = 24;

function enqueue(event: BridgeEvent): void {
    eventQueue.push(event);
    if (eventQueue.length > MAX_EVENTS) {
        eventQueue.splice(0, eventQueue.length - MAX_EVENTS);
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function statusSnapshot(): BridgeStatus {
    return {
        running: Boolean(server?.listening),
        host: HOST,
        port: activePort,
        clientCount: clients.size,
        lastError,
        version: BRIDGE_VERSION
    };
}

function queueServerOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = serverOperation.then(operation, operation);
    serverOperation = result.then(() => undefined, () => undefined);
    return result;
}

function writeHttpError(socket: Socket, status: number, message: string): void {
    if (socket.destroyed) return;

    const body = `${message}\n`;
    socket.end([
        `HTTP/1.1 ${status} ${message}`,
        "Connection: close",
        "Content-Type: text/plain; charset=utf-8",
        `Content-Length: ${Buffer.byteLength(body)}`,
        "",
        body
    ].join("\r\n"));
}

function commonHttpHeaders(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Private-Network": "true",
        "Cache-Control": "no-store"
    };
}

function writeHttpResponseError(response: ServerResponse, status: number, message: string): void {
    if (response.destroyed || response.writableEnded) return;

    const body = `${message}
`;
    response.writeHead(status, {
        ...commonHttpHeaders(),
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "X-Content-Type-Options": "nosniff"
    });
    response.end(body);
}

function normalizeYandexCoverSize(url: URL): URL {
    if (!YANDEX_COVER_HOSTS.has(url.hostname.toLowerCase())) return url;

    // PulseSync builds on Linux can expose Yandex's raw coverUri, whose last
    // path segment is a size placeholder (usually %% or {size}). Requesting
    // that raw URL returns no usable image, so resolve it before downloading.
    const normalizedHref = url.href.replace(
        /(?:%25%25|%%|%257Bsize%257D|%7Bsize%7D|\{size\}|%25s|%s)/gi,
        YANDEX_COVER_SIZE
    );

    try {
        return new URL(normalizedHref);
    } catch {
        return url;
    }
}

function parseAllowedCoverUrl(value: string | null, base?: URL): URL | null {
    if (!value) return null;

    let url: URL;
    try {
        url = base ? new URL(value, base) : new URL(value);
    } catch {
        return null;
    }

    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.port && url.port !== "443") return null;
    if (!ALLOWED_COVER_HOSTS.has(url.hostname.toLowerCase())) return null;
    return normalizeYandexCoverSize(url);
}

async function fetchCover(url: URL, init: RequestInit): Promise<Response> {
    let electronError: unknown = null;

    // Electron's net.fetch uses Chromium's network stack. On Linux this is
    // important because it follows Discord/Electron proxy and certificate
    // settings, while Node's global fetch can fail before an image is returned.
    try {
        return await net.fetch(url.href, init);
    } catch (error) {
        electronError = error;
    }

    if (typeof globalThis.fetch === "function") {
        try {
            return await globalThis.fetch(url.href, init);
        } catch (fallbackError) {
            throw new Error(
                `Electron net.fetch failed: ${errorMessage(electronError)}; `
                + `global fetch failed: ${errorMessage(fallbackError)}`
            );
        }
    }

    throw electronError;
}

async function downloadCover(url: URL, redirectCount = 0): Promise<DownloadedCover> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), COVER_FETCH_TIMEOUT_MS);
    timeout.unref();

    try {
        const remoteResponse = await fetchCover(url, {
            redirect: "manual",
            signal: controller.signal,
            headers: {
                // Preserve animated GIFs instead of allowing an image CDN to
                // negotiate a flattened AVIF/WebP representation.
                Accept: url.pathname.toLowerCase().endsWith(".gif")
                    ? "image/gif,image/*;q=0.9,*/*;q=0.5"
                    : "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "User-Agent": `YMControls/${BRIDGE_VERSION}`
            }
        });

        if (COVER_REDIRECT_STATUSES.has(remoteResponse.status)) {
            if (redirectCount >= MAX_COVER_REDIRECTS) {
                throw new Error("Too many redirects");
            }

            const redirectedUrl = parseAllowedCoverUrl(remoteResponse.headers.get("location"), url);
            if (!redirectedUrl) throw new Error("Redirected to a disallowed cover host");
            return downloadCover(redirectedUrl, redirectCount + 1);
        }

        if (!remoteResponse.ok) {
            throw new Error(`Remote server returned HTTP ${remoteResponse.status}`);
        }

        const contentType = (remoteResponse.headers.get("content-type") ?? "")
            .split(";", 1)[0]
            .trim()
            .toLowerCase();
        if (!contentType.startsWith("image/")) {
            throw new Error(`Unexpected content type: ${contentType || "unknown"}`);
        }

        const declaredLength = Number(remoteResponse.headers.get("content-length"));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_COVER_BYTES) {
            throw new Error("Cover is too large");
        }

        const body = Buffer.from(await remoteResponse.arrayBuffer());
        if (body.length === 0) throw new Error("Cover response is empty");
        if (body.length > MAX_COVER_BYTES) throw new Error("Cover is too large");

        return { body, contentType };
    } finally {
        clearTimeout(timeout);
    }
}

function cacheCoverDataUrl(key: string, value: string): void {
    coverDataUrlCache.delete(key);
    coverDataUrlCache.set(key, value);
    while (coverDataUrlCache.size > MAX_COVER_DATA_URL_CACHE_ENTRIES) {
        const oldest = coverDataUrlCache.keys().next().value as string | undefined;
        if (!oldest) break;
        coverDataUrlCache.delete(oldest);
    }
}

export async function getCoverDataUrl(_: IpcMainInvokeEvent, rawUrl: string): Promise<string> {
    const remoteUrl = parseAllowedCoverUrl(String(rawUrl ?? ""));
    if (!remoteUrl) return "";

    const cacheKey = remoteUrl.href;
    const cached = coverDataUrlCache.get(cacheKey);
    if (cached) {
        coverDataUrlCache.delete(cacheKey);
        coverDataUrlCache.set(cacheKey, cached);
        return cached;
    }

    try {
        const cover = await downloadCover(remoteUrl);
        const dataUrl = `data:${cover.contentType};base64,${cover.body.toString("base64")}`;
        cacheCoverDataUrl(cacheKey, dataUrl);
        return dataUrl;
    } catch (error) {
        console.warn(`[YMControls/native] IPC cover load failed for ${remoteUrl.hostname}: ${errorMessage(error)}`);
        return "";
    }
}

async function handleCoverRequest(url: URL, response: ServerResponse): Promise<void> {
    const remoteUrl = parseAllowedCoverUrl(url.searchParams.get("url"));
    if (!remoteUrl) {
        writeHttpResponseError(response, 400, "Invalid or unsupported cover URL");
        return;
    }

    try {
        const cover = await downloadCover(remoteUrl);
        if (response.destroyed || response.writableEnded) return;

        response.writeHead(200, {
            ...commonHttpHeaders(),
            // Do not pin the remotely hosted fallback GIF in Chromium's cache.
            // Regular Yandex artwork remains cached for one day.
            "Cache-Control": remoteUrl.hostname.toLowerCase() === "i.postimg.cc"
                ? "no-store"
                : "public, max-age=86400, immutable",
            "Content-Type": cover.contentType,
            "Content-Length": cover.body.length,
            "Cross-Origin-Resource-Policy": "cross-origin",
            "X-Content-Type-Options": "nosniff"
        });
        response.end(cover.body);
    } catch (error) {
        console.warn(`[YMControls/native] Cover proxy failed for ${remoteUrl.hostname}: ${errorMessage(error)}`);
        writeHttpResponseError(response, 502, "Could not load cover image");
    }
}

function handleHttpRequest(request: IncomingMessage, response: ServerResponse): void {
    if (request.method === "OPTIONS") {
        response.writeHead(204, commonHttpHeaders());
        response.end();
        return;
    }

    let url: URL;
    try {
        url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${HOST}:${activePort || DEFAULT_PORT}`}`);
    } catch {
        response.writeHead(400, {
            ...commonHttpHeaders(),
            "Content-Type": "text/plain; charset=utf-8"
        });
        response.end("Bad Request\n");
        return;
    }

    if (request.method === "GET" && url.pathname === "/cover") {
        void handleCoverRequest(url, response);
        return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
        const status = statusSnapshot();
        const body = JSON.stringify({
            ok: status.running,
            name: BRIDGE_NAME,
            ...status,
            websocketUrl: `ws://${HOST}:${status.port || DEFAULT_PORT}/ymcontrols`,
            coverProxyUrl: `http://${HOST}:${status.port || DEFAULT_PORT}/cover?url=...`,
            coverHosts: [...ALLOWED_COVER_HOSTS],
            acceptedPaths: [...ACCEPTED_PATHS]
        });

        response.writeHead(200, {
            ...commonHttpHeaders(),
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": Buffer.byteLength(body)
        });
        response.end(body);
        return;
    }

    response.writeHead(426, {
        ...commonHttpHeaders(),
        "Content-Type": "text/plain; charset=utf-8",
        "Upgrade": "websocket"
    });
    response.end("WebSocket upgrade required. Health check: /health\n");
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
    const firstByte = 0x80 | (opcode & 0x0f);

    if (payload.length < 126) {
        return Buffer.concat([Buffer.from([firstByte, payload.length]), payload]);
    }

    if (payload.length <= 0xffff) {
        const header = Buffer.allocUnsafe(4);
        header[0] = firstByte;
        header[1] = 126;
        header.writeUInt16BE(payload.length, 2);
        return Buffer.concat([header, payload]);
    }

    const header = Buffer.allocUnsafe(10);
    header[0] = firstByte;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
    return Buffer.concat([header, payload]);
}

function sendFrame(client: ClientConnection, opcode: number, payload = Buffer.alloc(0)): boolean {
    if (client.socket.destroyed || !client.socket.writable) return false;

    try {
        client.socket.write(encodeFrame(opcode, payload));
        return true;
    } catch (error) {
        enqueue({ type: "error", message: `Send failed: ${errorMessage(error)}`, at: Date.now() });
        return false;
    }
}

function closePayload(code: number, reason: string): Buffer {
    const reasonBuffer = Buffer.from(reason).subarray(0, 123);
    const payload = Buffer.allocUnsafe(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);
    return payload;
}

function removeClient(client: ClientConnection, reason: string): void {
    if (!clients.delete(client.id)) return;

    enqueue({
        type: "disconnected",
        clientId: client.id,
        reason,
        at: Date.now()
    });
    console.info(`[YMControls/native] ${client.id} disconnected: ${reason}`);
}

function terminateClient(client: ClientConnection, code: number, reason: string): void {
    removeClient(client, reason);
    sendFrame(client, 0x8, closePayload(code, reason));
    client.socket.end();

    const timer = setTimeout(() => client.socket.destroy(), 250);
    timer.unref();
}

function emitTextMessage(client: ClientConnection, payload: Buffer): void {
    if (payload.length > MAX_MESSAGE_BYTES) {
        terminateClient(client, 1009, "Message too large");
        return;
    }

    enqueue({
        type: "message",
        clientId: client.id,
        data: payload.toString("utf8"),
        at: Date.now()
    });
}

function processFrame(client: ClientConnection, fin: boolean, opcode: number, payload: Buffer): boolean {
    if (opcode >= 0x8) {
        if (!fin || payload.length > 125) {
            terminateClient(client, 1002, "Invalid control frame");
            return false;
        }

        switch (opcode) {
            case 0x8: {
                let reason = "Peer closed the connection";
                if (payload.length >= 2) {
                    reason = payload.subarray(2).toString("utf8") || reason;
                }
                removeClient(client, reason);
                sendFrame(client, 0x8, payload);
                client.socket.end();
                return false;
            }
            case 0x9:
                sendFrame(client, 0xA, payload);
                return true;
            case 0xA:
                return true;
            default:
                terminateClient(client, 1002, "Unsupported control opcode");
                return false;
        }
    }

    if (opcode === 0x2) {
        terminateClient(client, 1003, "Binary messages are not supported");
        return false;
    }

    if (opcode === 0x1) {
        if (client.fragmentOpcode !== null) {
            terminateClient(client, 1002, "Unexpected data frame");
            return false;
        }

        if (fin) {
            emitTextMessage(client, payload);
            return clients.has(client.id);
        }

        client.fragmentOpcode = opcode;
        client.fragments = [payload];
        client.fragmentBytes = payload.length;
        return true;
    }

    if (opcode === 0x0) {
        if (client.fragmentOpcode === null) {
            terminateClient(client, 1002, "Unexpected continuation frame");
            return false;
        }

        client.fragments.push(payload);
        client.fragmentBytes += payload.length;
        if (client.fragmentBytes > MAX_MESSAGE_BYTES) {
            terminateClient(client, 1009, "Message too large");
            return false;
        }

        if (fin) {
            const message = Buffer.concat(client.fragments, client.fragmentBytes);
            client.fragmentOpcode = null;
            client.fragments = [];
            client.fragmentBytes = 0;
            emitTextMessage(client, message);
        }

        return clients.has(client.id);
    }

    terminateClient(client, 1002, "Unsupported data opcode");
    return false;
}

function parseFrames(client: ClientConnection, chunk: Buffer): void {
    if (!clients.has(client.id)) return;

    client.buffer = client.buffer.length ? Buffer.concat([client.buffer, chunk]) : chunk;
    if (client.buffer.length > MAX_MESSAGE_BYTES + 32) {
        terminateClient(client, 1009, "Buffered data too large");
        return;
    }

    while (client.buffer.length >= 2 && clients.has(client.id)) {
        const first = client.buffer[0];
        const second = client.buffer[1];
        const fin = (first & 0x80) !== 0;
        const reserved = first & 0x70;
        const opcode = first & 0x0f;
        const masked = (second & 0x80) !== 0;
        let payloadLength = second & 0x7f;
        let offset = 2;

        if (reserved !== 0) {
            terminateClient(client, 1002, "Extensions are not supported");
            return;
        }

        if (!masked) {
            terminateClient(client, 1002, "Client frames must be masked");
            return;
        }

        if (payloadLength === 126) {
            if (client.buffer.length < 4) return;
            payloadLength = client.buffer.readUInt16BE(2);
            offset = 4;
        } else if (payloadLength === 127) {
            if (client.buffer.length < 10) return;
            const wideLength = client.buffer.readBigUInt64BE(2);
            if (wideLength > BigInt(MAX_MESSAGE_BYTES)) {
                terminateClient(client, 1009, "Frame too large");
                return;
            }
            payloadLength = Number(wideLength);
            offset = 10;
        }

        if (payloadLength > MAX_MESSAGE_BYTES) {
            terminateClient(client, 1009, "Frame too large");
            return;
        }

        const frameLength = offset + 4 + payloadLength;
        if (client.buffer.length < frameLength) return;

        const mask = client.buffer.subarray(offset, offset + 4);
        offset += 4;
        const payload = Buffer.from(client.buffer.subarray(offset, offset + payloadLength));
        client.buffer = client.buffer.subarray(frameLength);

        for (let index = 0; index < payload.length; index++) {
            payload[index] ^= mask[index & 3];
        }

        if (!processFrame(client, fin, opcode, payload)) return;
    }
}

function rejectUpgrade(socket: Socket, status: number, message: string): void {
    lastError = `Rejected WebSocket handshake: ${message}`;
    console.warn(`[YMControls/native] ${lastError}`);
    writeHttpError(socket, status, message);
}

function handleUpgrade(request: IncomingMessage, socket: Socket, head: Buffer): void {
    const upgrade = request.headers.upgrade;
    const connection = request.headers.connection;
    const key = request.headers["sec-websocket-key"];
    const version = request.headers["sec-websocket-version"];

    if (upgrade?.toLowerCase() !== "websocket"
        || !connection?.toLowerCase().split(/\s*,\s*/).includes("upgrade")
        || typeof key !== "string"
        || version !== "13") {
        rejectUpgrade(socket, 400, "Bad Request");
        return;
    }

    let url: URL;
    try {
        url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${HOST}:${activePort}`}`);
    } catch {
        rejectUpgrade(socket, 400, "Bad Request");
        return;
    }

    if (!ACCEPTED_PATHS.has(url.pathname)) {
        rejectUpgrade(socket, 404, "Not Found");
        return;
    }

    const accept = createHash("sha1")
        .update(key + WEBSOCKET_GUID)
        .digest("base64");

    socket.write([
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "",
        ""
    ].join("\r\n"));

    for (const existingClient of [...clients.values()]) {
        terminateClient(existingClient, 1008, "Another YMControls client connected");
    }

    const client: ClientConnection = {
        id: `pulse-${nextClientId++}`,
        socket,
        buffer: Buffer.alloc(0),
        fragmentOpcode: null,
        fragments: [],
        fragmentBytes: 0
    };

    clients.set(client.id, client);
    lastError = null;
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30_000);

    socket.on("data", chunk => parseFrames(client, chunk));
    socket.on("error", error => {
        enqueue({ type: "error", message: `Client ${client.id}: ${errorMessage(error)}`, at: Date.now() });
        removeClient(client, "Socket error");
    });
    socket.on("close", () => removeClient(client, "Socket closed"));

    console.info(`[YMControls/native] ${client.id} connected via ${url.pathname}; origin=${request.headers.origin ?? "none"}`);
    enqueue({ type: "connected", clientId: client.id, at: Date.now() });
    if (head.length) parseFrames(client, head);
}

async function stopServerInternal(reason: string): Promise<void> {
    for (const client of [...clients.values()]) {
        terminateClient(client, 1001, reason);
    }

    const currentServer = server;
    server = null;
    activePort = 0;

    if (!currentServer) return;

    await new Promise<void>(resolve => {
        currentServer.close(() => resolve());
        const timer = setTimeout(resolve, 500);
        timer.unref();
    });
}

async function startServerInternal(requestedPort: number, source: string): Promise<BridgeStatus> {
    const port = Number(requestedPort);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error("Port must be an integer from 1024 to 65535.");
    }

    if (server?.listening && activePort === port) {
        return statusSnapshot();
    }

    await stopServerInternal("Bridge restarted");
    eventQueue.length = 0;
    lastError = null;
    activePort = port;

    const candidate = createServer(handleHttpRequest);

    candidate.on("upgrade", handleUpgrade);
    candidate.on("clientError", (error, socket) => {
        lastError = errorMessage(error);
        enqueue({ type: "error", message: `HTTP client error: ${lastError}`, at: Date.now() });
        socket.destroy();
    });

    await new Promise<void>((resolve, reject) => {
        const handleStartError = (error: Error) => {
            lastError = errorMessage(error);
            activePort = 0;
            enqueue({ type: "error", message: `WebSocket server: ${lastError}`, at: Date.now() });
            console.error(`[YMControls/native] Could not listen on ${HOST}:${port}:`, error);
            reject(error);
        };

        candidate.once("error", handleStartError);
        candidate.listen(port, HOST, () => {
            candidate.off("error", handleStartError);
            candidate.on("error", error => {
                lastError = errorMessage(error);
                enqueue({ type: "error", message: `WebSocket server: ${lastError}`, at: Date.now() });
                console.error("[YMControls/native] WebSocket server error:", error);
            });
            server = candidate;
            candidate.unref();
            console.info(`[YMControls/native] v${BRIDGE_VERSION} listening on ws://${HOST}:${port}/ymcontrols (${source}).`);
            resolve();
        });
    });

    return statusSnapshot();
}

export function startServer(_: IpcMainInvokeEvent, requestedPort: number): Promise<BridgeStatus> {
    return queueServerOperation(() => startServerInternal(requestedPort, "renderer IPC"));
}

export function stopServer(_: IpcMainInvokeEvent): Promise<BridgeStatus> {
    return queueServerOperation(async () => {
        await stopServerInternal("Plugin stopped");
        return statusSnapshot();
    });
}

export function getStatus(_: IpcMainInvokeEvent): BridgeStatus {
    return statusSnapshot();
}

export function drainEvents(_: IpcMainInvokeEvent, requestedLimit = 100): BridgeEvent[] {
    const limit = Math.max(1, Math.min(250, Math.trunc(Number(requestedLimit) || 100)));
    return eventQueue.splice(0, limit);
}

export function sendMessage(_: IpcMainInvokeEvent, clientId: string, data: string): boolean {
    const client = clients.get(String(clientId));
    if (!client) return false;

    const payload = Buffer.from(String(data));
    if (payload.length > MAX_MESSAGE_BYTES) return false;
    return sendFrame(client, 0x1, payload);
}

export function broadcast(_: IpcMainInvokeEvent, data: string): number {
    const payload = Buffer.from(String(data));
    if (payload.length > MAX_MESSAGE_BYTES) return 0;

    let sent = 0;
    for (const client of clients.values()) {
        if (sendFrame(client, 0x1, payload)) sent++;
    }
    return sent;
}

// Main-process fallback: the bridge starts even before Discord's renderer reaches
// the plugin lifecycle. The renderer will reuse it or restart it on a custom port.
void queueServerOperation(() => startServerInternal(DEFAULT_PORT, "native auto-start"))
    .catch(error => console.error("[YMControls/native] Automatic bridge start failed:", error));
