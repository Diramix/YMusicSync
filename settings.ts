/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

function isValidToken(value: string): true | string {
    const token = value.trim();
    if (token.length > 0 && token.length < 20) return "Token looks too short";
    return true;
}

export const settings = definePluginSettings({
    oauthToken: {
        type: OptionType.STRING,
        displayName: "Yandex Music OAuth token",
        description: "Token used to join Ynison",
        default: "",
        placeholder: "y0_Ag…",
        target: "DESKTOP",
        isValid: isValidToken
    },
    hideAfterPauseSeconds: {
        type: OptionType.NUMBER,
        displayName: "Hide after pause",
        description: "Hide the panel after the track has been paused for this many seconds, 0 keeps it always visible",
        default: 300,
        isValid: value => Number(value) >= 0 || "Time cannot be negative"
    },
    showVolume: {
        type: OptionType.BOOLEAN,
        displayName: "Show volume slider",
        description: "Show the volume slider under the playback controls",
        default: true
    }
});
