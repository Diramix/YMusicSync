/*
 * Vencord/Equicord user plugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { getIntlMessage } from "@utils/discord";
import definePlugin, { ReporterTestable } from "@utils/types";
import { createRoot } from "@webpack/common";

import { PulseSyncPlayer } from "./Player";
import { settings } from "./settings";
import { PulseSyncStore } from "./store";

const MOUNT_ID = "vc-pulsesync-mount";
const PANEL_SELECTOR = '[class*="panels_"]';

let observer: MutationObserver | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let mountNode: HTMLDivElement | null = null;

function findAccountPanel(): Element | null {
    const label = getIntlMessage("USER_PROFILE_ACCOUNT_POPOUT_BUTTON_A11Y_LABEL");
    if (!label) return null;

    const anchor = document.querySelector(`[aria-label="${CSS.escape(label)}"]`);
    return anchor?.closest(PANEL_SELECTOR) ?? null;
}

function ensureMounted(): void {
    const panel = findAccountPanel();
    if (!panel) return;

    if (!mountNode) {
        mountNode = document.createElement("div");
        mountNode.id = MOUNT_ID;
    }

    if (!panel.contains(mountNode)) {
        panel.insertBefore(mountNode, panel.firstChild);
    }

    if (!root) {
        root = createRoot(mountNode);
        root.render(
            <ErrorBoundary noop>
                <PulseSyncPlayer />
            </ErrorBoundary>
        );
    }
}

function startWatching(): void {
    ensureMounted();

    observer = new MutationObserver(() => ensureMounted());
    observer.observe(document.body, { childList: true, subtree: true });
}

function stopWatching(): void {
    observer?.disconnect();
    observer = null;

    root?.unmount();
    root = null;

    mountNode?.remove();
    mountNode = null;
}

export default definePlugin({
    name: "YMControls",
    description: "Control Yandex Music in Pulse Sync from an advanced player above the Discord account panel.",
    authors: [{ name: "Local user", id: 0n }],
    tags: ["Media", "Utility"],
    searchTerms: ["Yandex Music", "Pulse Sync", "YMControls", "Music Controls"],
    settings,
    reporterTestable: ReporterTestable.None,

    start() {
        void PulseSyncStore.start();
        startWatching();
    },

    stop() {
        void PulseSyncStore.stop();
        stopWatching();
    },

    toolboxActions: {
        "Restart YMControls bridge": () => void PulseSyncStore.restart(),
        "Log YMControls diagnostics": () => void PulseSyncStore.logDiagnostics()
    }
});
