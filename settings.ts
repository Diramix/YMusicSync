/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const DEFAULT_PORT = 24891;
export const DEFAULT_BACKGROUND_COLOR = "#292c3e";

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function localized(english: string, russian: string): string {
    try {
        return settings.store.language === "ru" ? russian : english;
    } catch {
        return english;
    }
}

export const settings = definePluginSettings({
    language: {
        type: OptionType.SELECT,
        displayName: "Language / Язык",
        description: "Choose the YMControls player language. / Выберите язык плеера YMControls.",
        options: [
            { label: "English", value: "en", default: true },
            { label: "Русский", value: "ru" }
        ]
    },
    port: {
        type: OptionType.NUMBER,
        get displayName() { return localized("WebSocket port", "Порт WebSocket"); },
        get description() { return localized(
            "Local port used by the YMControls add-on in Pulse Sync. Must match the add-on setting.",
            "Локальный порт аддона YMControls в Pulse Sync. Он должен совпадать с портом в настройках аддона."
        ); },
        default: DEFAULT_PORT,
        restartNeeded: true,
        target: "DESKTOP",
        isValid: value => typeof value === "number" && Number.isInteger(value) && value >= 1024 && value <= 65535
            || localized("Port must be an integer from 1024 to 65535.", "Порт должен быть целым числом от 1024 до 65535.")
    },
    pollInterval: {
        type: OptionType.SLIDER,
        get displayName() { return localized("Player refresh interval", "Интервал обновления плеера"); },
        get description() { return localized(
            "How often Vencord/Equicord requests a fresh player snapshot.",
            "Как часто Vencord/Equicord запрашивает новое состояние плеера."
        ); },
        markers: [250, 500, 1000, 2000, 5000],
        default: 1000,
        stickToMarkers: true,
        target: "DESKTOP"
    },
    colorizeClient: {
        type: OptionType.BOOLEAN,
        get displayName() { return localized("Colorize entire Discord client", "Окрасить весь клиент Discord"); },
        get description() { return localized(
            "Apply the active Colorize 2 or PulseColor color to the whole Discord client. This option has no effect while both add-ons are disabled. Player theme settings are ignored while client colorization is active.",
            "Применяет активный цвет Colorize 2 или PulseColor ко всему клиенту Discord. Если оба аддона выключены, настройка ничего не меняет. При активной окраске настройки темы плеера игнорируются."
        ); },
        default: false
    },
    themeMode: {
        type: OptionType.SELECT,
        get displayName() { return localized("Player theme", "Тема плеера"); },
        get description() { return localized(
            "Use a custom color, Discord's current panel color, or the dominant cover color. Text and controls adapt automatically to light backgrounds.",
            "Использует пользовательский цвет, текущий цвет панели Discord или доминирующий цвет обложки. Текст и элементы управления автоматически адаптируются к светлому фону."
        ); },
        disabled: () => settings.store.colorizeClient,
        get options() {
            return [
                { label: localized("Custom color", "Пользовательский цвет"), value: "custom", default: true },
                { label: localized("Discord theme", "Тема Discord"), value: "discord" },
                { label: localized("Cover color", "Цвет обложки"), value: "cover" }
            ];
        }
    },
    backgroundColor: {
        type: OptionType.STRING,
        get displayName() { return localized("Custom player background", "Пользовательский фон плеера"); },
        get description() { return localized(
            "Background used by Custom color. Light colors automatically switch the player to dark text and controls. Examples: #292c3e, #111111 or #292c3ecc.",
            "Фон для режима пользовательского цвета. На светлом фоне плеер автоматически использует тёмный текст и элементы управления. Примеры: #292c3e, #111111 или #292c3ecc."
        ); },
        default: DEFAULT_BACKGROUND_COLOR,
        placeholder: DEFAULT_BACKGROUND_COLOR,
        disabled: () => settings.store.colorizeClient || settings.store.themeMode !== "custom",
        isValid: value => typeof value === "string" && HEX_COLOR.test(value.trim())
            || localized(
                "Enter a HEX color: #RGB, #RGBA, #RRGGBB or #RRGGBBAA.",
                "Введите HEX-цвет: #RGB, #RGBA, #RRGGBB или #RRGGBBAA."
            )
    },
    showDisconnected: {
        type: OptionType.BOOLEAN,
        get displayName() { return localized("Show disconnected panel", "Показывать панель отключения"); },
        get description() { return localized(
            "Show a compact status panel while Pulse Sync is not connected.",
            "Показывает компактную панель состояния, пока Pulse Sync не подключён."
        ); },
        default: true
    },
    showVolume: {
        type: OptionType.BOOLEAN,
        get displayName() { return localized("Show volume slider", "Показывать ползунок громкости"); },
        get description() { return localized(
            "Show the Pulse Sync volume slider below the playback controls.",
            "Показывает ползунок громкости Pulse Sync под кнопками управления воспроизведением."
        ); },
        default: true
    }
});
