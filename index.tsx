/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { disableStyle, enableStyle, setStyleClassNames } from "@api/Styles";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin, { ReporterTestable } from "@utils/types";
import { findCssClassesLazy } from "@webpack";

import { YMusicSyncPlayer } from "./components/Player";
import { settings } from "./settings";
import { YMusicSyncStore } from "./store";
import style from "./styles.css?managed";

const SliderClasses = findCssClassesLazy("slider", "bar", "barFill", "grabber");

export default definePlugin({
    name: "YMusicSync",
    description: "Control Yandex Music through Ynison",
    authors: [{ name: "diram1x", id: 0n }],
    tags: ["Media", "Utility"],
    searchTerms: ["Yandex Music", "Ynison", "YMusicSync", "Music Controls"],
    settings,
    reporterTestable: ReporterTestable.None,

    patches: [
        {
            find: "#{intl::USER_PROFILE_ACCOUNT_POPOUT_BUTTON_A11Y_LABEL}",
            replacement: {
                // The callee is a member expression when another plugin (MusicControls)
                // already wrapped the account panel.
                match: /(?<=\i\.jsxs?\)\()((?:\i\.)*\i(?:\["[^"]+"\])?(?:\.\i)*),{(?=[^})]*?userTag:\i,occluded:)/,
                replace: "$self.PanelWrapper,{YMusicSync:$1,"
            }
        }
    ],

    PanelWrapper({ YMusicSync, ...props }) {
        return (
            <>
                <ErrorBoundary noop>
                    <YMusicSyncPlayer />
                </ErrorBoundary>
                <YMusicSync {...props} />
            </>
        );
    },

    start() {
        setStyleClassNames(style, { ...SliderClasses }, false);
        enableStyle(style);
        void YMusicSyncStore.start();
    },

    stop() {
        disableStyle(style);
        void YMusicSyncStore.stop();
    },

    toolboxActions: {
        "Reconnect to Ynison": () => void YMusicSyncStore.restart(),
        "Log YMusicSync diagnostics": () => void YMusicSyncStore.logDiagnostics()
    }
});
