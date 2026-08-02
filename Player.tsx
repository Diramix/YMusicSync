/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { plugins } from "@api/PluginManager";
import { CogWheel } from "@components/Icons";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import type { PluginNative } from "@utils/types";
import { React, ReactDOM, ThemeStore, useEffect, useRef, useState, useStateFromStores } from "@webpack/common";

import { FALLBACK_COVER_URL } from "./fallbackCover";
import { DEFAULT_BACKGROUND_COLOR, settings } from "./settings";
import { PulseSyncStore } from "./store";
import type { ArtistLink, Language, PlayerSnapshot, ThemeMode } from "./types";

const Native = VencordNative.pluginHelpers.YMControls as PluginNative<typeof import("./native")> | undefined;
const CLIENT_THEME_ATTRIBUTE = "data-vc-pulsesync-client-theme";
const CLIENT_THEME_COLOR_PROPERTY = "--vc-pulsesync-client-color";

function formatTime(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function SvgIcon({
    path,
    label,
    viewBox = "0 0 24 24",
    fill = "currentColor",
    stroke,
    strokeWidth,
    strokeLinecap,
    strokeLinejoin,
    fillRule,
    clipRule,
    className = ""
}: {
    path: string;
    label: string;
    viewBox?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    strokeLinecap?: "round" | "butt" | "square";
    strokeLinejoin?: "round" | "miter" | "bevel";
    fillRule?: "evenodd" | "nonzero";
    clipRule?: "evenodd" | "nonzero";
    className?: string;
}) {
    return (
        <svg
            className={`vc-pulsesync-icon${className ? ` ${className}` : ""}`}
            viewBox={viewBox}
            width="20"
            height="20"
            aria-label={label}
            focusable={false}
        >
            <path
                d={path}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinecap={strokeLinecap}
                strokeLinejoin={strokeLinejoin}
                fillRule={fillRule}
                clipRule={clipRule}
            />
        </svg>
    );
}

const ICONS = {
    play: "M8 5.82v12.36c0 .79.87 1.27 1.54.84l9.14-6.18a1 1 0 0 0 0-1.68L9.54 4.98C8.87 4.55 8 5.03 8 5.82z",
    pause: "M7 5h3v14H7V5zm7 0h3v14h-3V5z",
    previous: "M6 5h2v14H6V5zm3.5 7 8.5 6V6l-8.5 6z",
    next: "M16 5h2v14h-2V5zM6 6v12l8.5-6L6 6z",
    shuffle: "M2.2635 19.9911L2.24879 19.9948L1.75168 18.006C2.00239 17.9433 2.11112 17.916 2.21454 17.8875C4.10738 17.3646 5.77327 16.2364 6.96045 14.6803L8.1557 16.4579C6.7377 18.0938 4.86302 19.2827 2.76035 19.8635C2.62985 19.8995 2.49565 19.9331 2.26392 19.991L2.26362 19.9911L2.2635 19.9911ZM12.0518 16.8758C12.4618 17.4213 12.8597 17.8501 13.3473 18.1763C13.6212 18.3596 13.9124 18.5154 14.2168 18.6416C15.1395 19.0243 16.1654 19.0257 17.6312 19.025C17.069 19.7242 16.6353 20.652 16.4827 21.8728L18.5168 22.1271C18.7154 20.5383 19.5677 19.8068 20.374 19.4274C20.7968 19.2285 21.2155 19.1258 21.5327 19.0741C21.6895 19.0485 21.8164 19.0361 21.9 19.0302C21.9416 19.0272 21.972 19.0259 21.9894 19.0254L22.0055 19.0249L22.0038 19.0249L22.0023 19.0249H22.0014C22.0009 19.0249 22.0005 19.0249 22.0005 17.9999C22.0005 16.9749 22.0009 16.9749 22.0014 16.9749L22.0023 16.9749L22.0038 16.9749L22.0055 16.975L21.9894 16.9745C21.972 16.9739 21.9416 16.9726 21.9 16.9697C21.8164 16.9638 21.6895 16.9514 21.5327 16.9258C21.2155 16.8741 20.7968 16.7714 20.374 16.5725C19.5677 16.1931 18.7154 15.4616 18.5168 13.8728L16.4827 14.1271C16.6353 15.3478 17.069 16.2757 17.6312 16.9748C16.0436 16.973 15.4829 16.9474 15.002 16.748C14.8218 16.6733 14.6494 16.581 14.4873 16.4725C14.035 16.1699 13.6923 15.6892 12.7164 14.2253L11.2329 12.0001L12.7163 9.77486C13.6923 8.31082 14.035 7.83007 14.4873 7.52742C14.6495 7.41893 14.8219 7.32665 15.0021 7.25193C15.4829 7.05253 16.0437 7.02697 17.631 7.02518C17.0689 7.72432 16.6353 8.65213 16.4827 9.87281L18.5168 10.1271C18.7155 8.53823 19.5676 7.80671 20.3737 7.42738C20.7964 7.22847 21.215 7.12582 21.5321 7.07405C21.6889 7.04845 21.8158 7.0361 21.8993 7.03019C21.9409 7.02725 21.9713 7.02593 21.9887 7.02535L21.9945 7.0252L21.9951 7.02518L21.996 7.02519L21.9985 7.0252L21.9997 7.0252L22.0007 7.0252L22.0007 7.02503L22.0048 7.02493L22.0031 7.02493L22.0016 7.02494L22.0007 7.02494L22.0008 6.0002L22.0008 5.73998C22.0009 4.9752 22.0014 4.9752 22.0018 4.9752L22.0027 4.9752L22.0042 4.9752L22.0059 4.97521L21.9988 4.97502L21.9987 4.97494L21.9976 4.97494L21.9959 4.97495L21.995 4.97495L21.9898 4.97479C21.9724 4.97421 21.942 4.97289 21.9004 4.96994C21.817 4.96402 21.6901 4.95167 21.5334 4.92607C21.2164 4.87428 20.7979 4.7716 20.3753 4.57269C19.5695 4.19334 18.7174 3.46177 18.5188 1.8728L16.4846 2.12708C16.6372 3.34788 17.0709 4.27577 17.633 4.97498C16.1663 4.9742 15.1399 4.97551 14.2168 5.35829C13.9124 5.48451 13.6212 5.64037 13.3473 5.82361C12.5128 6.38201 11.9408 7.24092 11.1215 8.47119L11.0106 8.63775L10.0009 10.1523L9.14123 8.86273L9.13286 8.85019L9.1328 8.85008L9.1327 8.84994C9.00004 8.65096 8.92325 8.53577 8.84533 8.4249C7.37551 6.33346 5.22461 4.81777 2.76063 4.13713C2.62997 4.10104 2.49561 4.06746 2.26345 4.00943L2.24878 4.00576L1.75166 5.99457C2.00252 6.05728 2.11131 6.08454 2.2148 6.11313C4.22062 6.66721 5.97158 7.90107 7.16809 9.60362C7.22983 9.69146 7.2921 9.78474 7.43554 9.99989L8.25703 11.2321L12.0518 16.8758Z",
    repeat: "M1.97748 13.1989L1.97724 18.9997L4.02724 18.9998L4.02748 13.199C4.02754 11.6763 4.02899 10.6167 4.11714 9.80333C4.20321 9.00919 4.36197 8.57238 4.59583 8.25051C4.77933 7.99796 5.00144 7.77587 5.254 7.59238C5.57587 7.35853 6.01269 7.1998 6.80684 7.11376C7.62016 7.02565 8.67984 7.02425 10.2025 7.02426L13.0552 7.02428C12.4864 7.6775 11.9578 8.53027 11.542 9.6392L13.4615 10.3589C14.1243 8.59128 15.0803 7.78554 15.7965 7.40355C16.1651 7.20698 16.4912 7.11169 16.7155 7.06567C16.8275 7.0427 16.9129 7.03224 16.9638 7.02756C16.9892 7.02522 17.0058 7.02434 17.0125 7.02405C17.0143 7.02397 17.0154 7.02393 17.0158 7.02392C17.0161 7.02391 17.0158 7.02392 17.015 7.02394L17.0105 7.02401L17.0067 7.02404L17.0044 7.02405L17.0031 7.02405C17.003 7.02405 17.0029 7.02405 17.0028 7.01632L17.0028 6.01016L17.0028 5.99931V5.98807C17.0028 4.97431 17.0034 4.97431 17.0041 4.97431L17.0053 4.97431L17.0076 4.97432L17.0114 4.97435L17.016 4.97442L17.0168 4.97444L17.0134 4.97431C17.0067 4.97401 16.9901 4.97313 16.9647 4.9708C16.9138 4.96612 16.8283 4.95567 16.7163 4.9327C16.4919 4.88668 16.1658 4.79141 15.7972 4.59486C15.0811 4.21293 14.1254 3.4073 13.4636 1.63965L11.5438 2.35845C11.9591 3.46783 12.4876 4.32089 13.0563 4.97428L10.2025 4.97426H10.1436C8.69381 4.97423 7.52276 4.97421 6.58604 5.07569C5.61748 5.18062 4.77865 5.40382 4.04907 5.93387C3.62248 6.24379 3.24732 6.61893 2.93738 7.04551C2.4073 7.77506 2.18405 8.61388 2.07908 9.58244C1.97755 10.5191 1.97752 11.6902 1.97748 13.14L1.97748 13.1989ZM22.2287 10.7125L22.229 5.00009L20.179 4.99997L20.1787 10.7123C20.1786 12.235 20.1771 13.2946 20.089 14.108C20.0029 14.9021 19.8441 15.3389 19.6103 15.6607C19.4268 15.9133 19.2047 16.1354 18.9521 16.3189C18.6302 16.5527 18.1934 16.7114 17.3993 16.7975C16.586 16.8856 15.5263 16.887 14.0036 16.887L11.1509 16.887C11.7197 16.2337 12.2483 15.381 12.664 14.272L10.7445 13.5523C10.0818 15.32 9.12578 16.1257 8.40955 16.5077C8.04098 16.7043 7.71483 16.7996 7.49051 16.8456C7.37854 16.8685 7.29312 16.879 7.24221 16.8837C7.21682 16.886 7.20024 16.8869 7.1935 16.8872C7.19127 16.8873 7.19013 16.8873 7.19013 16.8873L7.19099 16.8873L7.19558 16.8872L7.19938 16.8872L7.20166 16.8872L7.2029 16.8872C7.20302 16.8872 7.20315 16.8872 7.20327 16.895L7.20327 17.9025V17.9119L7.20327 17.9217C7.20326 18.9369 7.2026 18.9369 7.20196 18.9369L7.20072 18.9369L7.19844 18.9369L7.19464 18.9369L7.19007 18.9368L7.1892 18.9368C7.1892 18.9368 7.19034 18.9368 7.19258 18.9369C7.19933 18.9372 7.21592 18.9381 7.24132 18.9404C7.29226 18.9451 7.37771 18.9556 7.48971 18.9785C7.71409 19.0246 8.04027 19.1198 8.4088 19.3164C9.1249 19.6983 10.0806 20.5039 10.7424 22.2716L12.6623 21.5528C12.2469 20.4434 11.7185 19.5904 11.1497 18.937L14.0036 18.937H14.0626C15.5124 18.937 16.6834 18.937 17.6201 18.8356C18.5886 18.7306 19.4274 18.5074 20.157 17.9774C20.5836 17.6675 20.9588 17.2923 21.2687 16.8658C21.7988 16.1362 22.022 15.2974 22.127 14.3289C22.2286 13.3922 22.2286 12.2212 22.2287 10.7714L22.2287 10.7125Z",
    repeatOne: "M1.97676 18.9997L1.97699 13.1989L1.97699 13.14C1.97703 11.6902 1.97706 10.5191 2.07859 9.58244C2.18356 8.61388 2.40681 7.77506 2.93689 7.04551C3.24683 6.61893 3.62199 6.24379 4.04858 5.93387C4.77816 5.40382 5.61699 5.18062 6.58555 5.07569C7.52227 4.97421 8.69332 4.97423 10.1431 4.97426H10.202L13.0558 4.97428C12.4871 4.32089 11.9586 3.46783 11.5433 2.35845L13.4631 1.63965C14.125 3.4073 15.0806 4.21293 15.7967 4.59486C16.1653 4.79141 16.4915 4.88668 16.7158 4.9327C16.8278 4.95567 16.9133 4.96612 16.9642 4.9708C16.9896 4.97313 17.0062 4.97401 17.013 4.97431L17.0163 4.97444L17.0155 4.97442L17.0109 4.97435L17.0071 4.97432L17.0048 4.97431L17.0036 4.97431C17.0029 4.97431 17.0023 4.97431 17.0023 5.98807V5.99931L17.0023 6.01016L17.0023 7.02431L17.0009 7.02431L16.9995 7.0243L16.9964 7.02429L10.202 7.02426C8.67935 7.02425 7.61968 7.02565 6.80635 7.11376C6.0122 7.1998 5.57539 7.35853 5.25351 7.59238C5.00095 7.77587 4.77884 7.99796 4.59534 8.25051C4.36148 8.57238 4.20272 9.00919 4.11665 9.80333C4.0285 10.6167 4.02705 11.6763 4.02699 13.199L4.02675 18.9998L1.97676 18.9997ZM22.2285 5.00009L22.2282 10.7125L22.2282 10.7714C22.2281 12.2212 22.2281 13.3922 22.1265 14.3289C22.0215 15.2974 21.7983 16.1362 21.2682 16.8658C20.9583 17.2923 20.5831 17.6675 20.1565 17.9774C19.4269 18.5074 18.5881 18.7306 17.6196 18.8356C16.6829 18.937 15.5119 18.937 14.0621 18.937H14.0031L11.1492 18.937C11.718 19.5904 12.2464 20.4434 12.6618 21.5528L10.7419 22.2716C10.0801 20.5039 9.12441 19.6983 8.40831 19.3164C8.03978 19.1198 7.7136 19.0246 7.48922 18.9785C7.37722 18.9556 7.29177 18.9451 7.24084 18.9404C7.21543 18.9381 7.19884 18.9372 7.1921 18.9369C7.18985 18.9368 7.18871 18.9368 7.18871 18.9368L7.18958 18.9368L7.19416 18.9369L7.19795 18.9369L7.20023 18.9369L7.20147 18.9369C7.20212 18.9369 7.20277 18.9369 7.20278 17.9217L7.20278 17.9119V17.9025L7.20279 16.8869L7.20415 16.8869L7.2056 16.8869L7.2087 16.887L14.0032 16.887C15.5258 16.887 16.5855 16.8856 17.3988 16.7975C18.1929 16.7114 18.6297 16.5527 18.9516 16.3189C19.2042 16.1354 19.4263 15.9133 19.6098 15.6607C19.8436 15.3389 20.0024 14.9021 20.0885 14.108C20.1766 13.2946 20.1781 12.235 20.1782 10.7123L20.1785 4.99997L22.2285 5.00009ZM11.5433 15H13.5553V8.99998H11.6821L9.99972 10.5903V12.4153L11.5433 10.9466V15Z",
    heartFilled: "M12 21s-7-4.35-9.33-8.12C.7 9.7 2.14 5.5 5.9 4.57A5.1 5.1 0 0 1 12 7a5.1 5.1 0 0 1 6.1-2.43c3.76.93 5.2 5.13 3.23 8.31C19 16.65 12 21 12 21z",
    heartOutline: "M12.1 21.35l-.1-.08-.11.08C8.14 18.2 1.9 14.13 1.9 8.86c0-2.82 2.12-4.96 4.87-4.96 1.92 0 3.54.92 4.53 2.36.99-1.44 2.61-2.36 4.53-2.36 2.75 0 4.87 2.14 4.87 4.96 0 5.27-6.24 9.34-9.5 12.49z",
    volumeMuted: "M4 9v6h4l5 4V5L8 9H4zm12.05 1.64-1.41 1.41 2.12 2.12-2.12 2.12 1.41 1.41 2.12-2.12 2.12 2.12 1.41-1.41-2.12-2.12 2.12-2.12-1.41-1.41-2.12 2.12-2.12-2.12z",
    volumeLow: "M4 9v6h4l5 4V5L8 9H4zm11.5.5a4 4 0 0 1 0 5l1.42 1.42a6 6 0 0 0 0-7.84L15.5 9.5z",
    volumeMedium: "M4 9v6h4l5 4V5L8 9H4zm11.5.5a4 4 0 0 1 0 5l1.42 1.42a6 6 0 0 0 0-7.84L15.5 9.5zm2.83-2.83a8 8 0 0 1 0 10.66l1.42 1.42a10 10 0 0 0 0-13.5l-1.42 1.42z",
    volumeHigh: "M3 9v6h4l5 4V5L7 9H3zm11.5.5a4 4 0 0 1 0 5l1.42 1.42a6 6 0 0 0 0-7.84L14.5 9.5zm2.83-2.83a8 8 0 0 1 0 10.66l1.42 1.42a10 10 0 0 0 0-13.5l-1.42 1.42z",
    queue: "M5 6h11v2H5V6zm0 5h11v2H5v-2zm0 5h7v2H5v-2zm13-1.5 4 2.5-4 2.5v-5z",
    close: "M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5z",
    copy: "M8 8h11v11H8V8zm-3-3h11v2H7v9H5V5z",
    external: "M14 4h6v6h-2V7.41l-7.29 7.3-1.42-1.42L16.59 6H14V4zM5 6h6v2H7v9h9v-4h2v6H5V6z",
};

const UI_TEXT = {
    en: {
        waitingAddon: "YMControls: waiting for the Pulse Sync add-on",
        bridgeNotRunning: "YMControls bridge is not running",
        coverMissing: "Cover unavailable",
        cover: "Cover",
        openExpandedPlayer: "Open expanded player",
        trackPosition: "Track position",
        unmute: "Unmute",
        mute: "Mute",
        volume: "Volume",
        queueNotFound: "Queue not found",
        queueUnavailable: "The queue structure may differ in this version of Yandex Music.",
        nowPlaying: "Now playing",
        nextTrack: "Next track",
        playThisTrack: "Play this track",
        yandexMusic: "Yandex Music",
        copied: "Copied",
        copyFailed: "Could not copy",
        expandedPlayerLabel: "YMControls expanded player",
        expandedPlayer: "Expanded player",
        close: "Close",
        year: "Year",
        duration: "Duration",
        openTrack: "Open track",
        openAlbum: "Open album",
        openArtist: "Open artist",
        copyLink: "Copy link",
        modalSections: "Expanded player sections",
        details: "Details",
        queue: "Queue",
        title: "Title",
        artists: "Artists",
        album: "Album",
        connected: "YMControls connected",
        waitingState: "Waiting for player state…",
        playerLabel: "YMControls player",
        openQueue: "Open queue",
        removeFromFavorites: "Remove from favorites",
        addToFavorites: "Add to favorites",
        shuffle: "Shuffle",
        previousTrack: "Previous track",
        pause: "Pause",
        play: "Play",
        repeat: "Repeat",
        repeatModes: { off: "off", context: "all", one: "one" },
        settings: "YMControls settings"
    },
    ru: {
        waitingAddon: "YMControls: ожидание аддона Pulse Sync",
        bridgeNotRunning: "YMControls bridge не запущен",
        coverMissing: "Обложка отсутствует",
        cover: "Обложка",
        openExpandedPlayer: "Открыть расширенный плеер",
        trackPosition: "Позиция трека",
        unmute: "Включить звук",
        mute: "Выключить звук",
        volume: "Громкость",
        queueNotFound: "Очередь не найдена",
        queueUnavailable: "В этой версии Яндекс Музыки структура очереди может отличаться.",
        nowPlaying: "Сейчас играет",
        nextTrack: "Следующий трек",
        playThisTrack: "Воспроизвести этот трек",
        yandexMusic: "Яндекс Музыка",
        copied: "Скопировано",
        copyFailed: "Не удалось скопировать",
        expandedPlayerLabel: "Расширенный плеер YMControls",
        expandedPlayer: "Расширенный плеер",
        close: "Закрыть",
        year: "Год",
        duration: "Длительность",
        openTrack: "Открыть трек",
        openAlbum: "Открыть альбом",
        openArtist: "Открыть исполнителя",
        copyLink: "Скопировать ссылку",
        modalSections: "Разделы расширенного плеера",
        details: "Информация",
        queue: "Очередь",
        title: "Название",
        artists: "Исполнители",
        album: "Альбом",
        connected: "YMControls подключён",
        waitingState: "Ожидание состояния плеера…",
        playerLabel: "Плеер YMControls",
        openQueue: "Открыть очередь",
        removeFromFavorites: "Убрать из любимых",
        addToFavorites: "Добавить в любимые",
        shuffle: "Перемешивание",
        previousTrack: "Предыдущий трек",
        pause: "Пауза",
        play: "Воспроизвести",
        repeat: "Повтор",
        repeatModes: { off: "выключен", context: "все треки", one: "один трек" },
        settings: "Настройки YMControls"
    }
} as const;

function usePlayerText() {
    const { language } = settings.use(["language"]);
    return UI_TEXT[(language as Language) === "ru" ? "ru" : "en"];
}

function ControlButton({ active = false, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; }) {
    return (
        <button
            type="button"
            className={`vc-pulsesync-button${active ? " vc-pulsesync-button-active" : ""}${className ? ` ${className}` : ""}`}
            {...props}
        />
    );
}

function openYMControlsSettings(): void {
    const plugin = plugins.YMControls;
    if (plugin) openPluginModal(plugin);
}

function normalizeHex(value: string): string | null {
    const candidate = typeof value === "string" ? value.trim() : "";
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(candidate)
        ? candidate
        : null;
}

function linearizeSrgb(channel: number): number {
    const normalized = channel / 255;
    return normalized <= 0.04045
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function isLightHex(value: string): boolean {
    const normalized = value.slice(1);
    const opaque = normalized.length === 3 || normalized.length === 4
        ? normalized.slice(0, 3).split("").map(char => char + char).join("")
        : normalized.slice(0, 6);
    if (opaque.length !== 6) return false;

    const red = Number.parseInt(opaque.slice(0, 2), 16);
    const green = Number.parseInt(opaque.slice(2, 4), 16);
    const blue = Number.parseInt(opaque.slice(4, 6), 16);
    const luminance = 0.2126 * linearizeSrgb(red)
        + 0.7152 * linearizeSrgb(green)
        + 0.0722 * linearizeSrgb(blue);

    // At this point black has a higher WCAG contrast ratio than white.
    return luminance > 0.179;
}

interface PlayerAppearance {
    style: React.CSSProperties;
    lightForeground: boolean;
}

function getPlayerAppearance(
    themeMode: ThemeMode,
    backgroundColor: string,
    accentColor: string,
    discordThemeIsLight: boolean
): PlayerAppearance {
    const custom = normalizeHex(backgroundColor) ?? DEFAULT_BACKGROUND_COLOR;
    const cover = normalizeHex(accentColor);
    const selectedHex = themeMode === "cover" && cover ? cover : custom;
    const background = themeMode === "discord"
        ? "transparent"
        : selectedHex;
    const themeAccent = cover ?? custom;

    return {
        style: {
            "--vc-pulsesync-background": background,
            "--vc-pulsesync-theme-accent": themeAccent
        } as React.CSSProperties,
        lightForeground: themeMode === "discord"
            ? discordThemeIsLight
            : isLightHex(selectedHex)
    };
}

function getThemeClassName(lightForeground: boolean, additionalClassName = ""): string {
    return [
        additionalClassName,
        lightForeground ? "vc-pulsesync-light-theme" : ""
    ].filter(Boolean).join(" ");
}

function getPlayerClassName(lightForeground: boolean, additionalClassName = ""): string {
    return [
        "vc-pulsesync-player",
        getThemeClassName(lightForeground, additionalClassName)
    ].filter(Boolean).join(" ");
}

function DisconnectedPanel({
    serverRunning,
    error,
    appearance
}: {
    serverRunning: boolean;
    error: string | null;
    appearance: PlayerAppearance;
}) {
    const text = usePlayerText();

    return (
        <div className={getPlayerClassName(appearance.lightForeground, "vc-pulsesync-offline")} style={appearance.style} role="status">
            <span className={`vc-pulsesync-status-dot${serverRunning ? " vc-pulsesync-status-waiting" : " vc-pulsesync-status-error"}`} />
            <div className="vc-pulsesync-offline-copy">
                <strong>{serverRunning ? text.waitingAddon : text.bridgeNotRunning}</strong>
                <span>{error || `127.0.0.1:${settings.store.port}`}</span>
            </div>
        </div>
    );
}

function normalizeUrl(url: string): string {
    const value = url.trim();
    if (!value) return "";
    if (value.startsWith("//")) return `https:${value}`;
    if (value.startsWith("/")) return `https://music.yandex.ru${value}`;
    return value;
}

const YANDEX_COVER_HOSTS = new Set([
    "avatars.yandex.net",
    "avatars.mds.yandex.net"
]);
const PROXIED_COVER_HOSTS = new Set([
    ...YANDEX_COVER_HOSTS,
    "i.postimg.cc"
]);
const YANDEX_COVER_SIZE = "400x400";

function normalizeYandexCoverSize(url: URL): URL {
    if (!YANDEX_COVER_HOSTS.has(url.hostname.toLowerCase())) return url;

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

function normalizeCoverRemoteUrl(rawUrl: string): string {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) return "";

    let remoteUrl: URL;
    try {
        remoteUrl = new URL(normalized);
    } catch {
        return "";
    }

    if (remoteUrl.protocol === "http:") remoteUrl.protocol = "https:";
    if (remoteUrl.protocol !== "https:") return "";
    return normalizeYandexCoverSize(remoteUrl).href;
}

async function resolveCoverSource(rawUrl: string): Promise<string> {
    const normalized = normalizeCoverRemoteUrl(rawUrl);
    if (!normalized) return "";

    let remoteUrl: URL;
    try {
        remoteUrl = new URL(normalized);
    } catch {
        return "";
    }

    if (!PROXIED_COVER_HOSTS.has(remoteUrl.hostname.toLowerCase())) return remoteUrl.href;

    // Discord's renderer is an HTTPS page and blocks http://127.0.0.1 images as
    // mixed content. Download allowed cover hosts in the main process and pass
    // the bytes back through IPC as a data URL instead.
    if (!Native?.getCoverDataUrl) return remoteUrl.href;
    try {
        // Native IPC avoids Discord CSP. A direct HTTPS fallback is retained
        // for Linux clients where the native helper is temporarily unavailable.
        return await Native.getCoverDataUrl(remoteUrl.href) || remoteUrl.href;
    } catch {
        return remoteUrl.href;
    }
}

function deriveImageColor(image: HTMLImageElement): string | null {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = 28;
        canvas.height = 28;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return null;

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const buckets = new Map<string, { weight: number; red: number; green: number; blue: number; }>();

        for (let index = 0; index < pixels.length; index += 4) {
            const alpha = pixels[index + 3] / 255;
            if (alpha < 0.5) continue;

            const red = pixels[index];
            const green = pixels[index + 1];
            const blue = pixels[index + 2];
            const max = Math.max(red, green, blue) / 255;
            const min = Math.min(red, green, blue) / 255;
            const lightness = (max + min) / 2;
            const delta = max - min;
            const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
            if (lightness < 0.05 || lightness > 0.95) continue;

            const weight = alpha * (0.4 + saturation * 1.8 + (1 - Math.abs(lightness - 0.5)) * 0.45);
            const key = `${red >> 4}:${green >> 4}:${blue >> 4}`;
            const bucket = buckets.get(key) ?? { weight: 0, red: 0, green: 0, blue: 0 };
            bucket.weight += weight;
            bucket.red += red * weight;
            bucket.green += green * weight;
            bucket.blue += blue * weight;
            buckets.set(key, bucket);
        }

        let best: { weight: number; red: number; green: number; blue: number; } | null = null;
        for (const bucket of buckets.values()) {
            if (!best || bucket.weight > best.weight) best = bucket;
        }
        if (!best || best.weight <= 0) return null;

        const toHex = (channel: number) => Math.round(channel / best!.weight).toString(16).padStart(2, "0");
        return `#${toHex(best.red)}${toHex(best.green)}${toHex(best.blue)}`;
    } catch {
        // A remote image without CORS permission taints the canvas. PulseSync's
        // accentColor or the local cover proxy remains available as a fallback.
        return null;
    }
}

function buildTrackUrl(snapshot: PlayerSnapshot): string {
    if (snapshot.trackUrl?.trim()) return normalizeUrl(snapshot.trackUrl);
    if (!snapshot.trackId) return "";
    return `https://music.yandex.ru/track/${encodeURIComponent(snapshot.trackId)}`;
}

function buildArtistLinks(snapshot: Pick<PlayerSnapshot, "artistLinks" | "artists">): ArtistLink[] {
    if (Array.isArray(snapshot.artistLinks) && snapshot.artistLinks.length) {
        return snapshot.artistLinks
            .map(link => ({ name: String(link?.name ?? "").trim(), url: normalizeUrl(String(link?.url ?? "")) }))
            .filter(link => link.name && link.url);
    }

    return snapshot.artists
        .filter(Boolean)
        .map(name => ({
            name,
            url: `https://music.yandex.ru/search?text=${encodeURIComponent(name)}`
        }));
}

function MetaLink({ href, className, title, children }: { href: string; className: string; title?: string; children: React.ReactNode; }) {
    return href ? (
        <a className={className} href={href} target="_blank" rel="noreferrer noopener" title={title}>
            {children}
        </a>
    ) : (
        <span className={className} title={title}>{children}</span>
    );
}

const COVER_RECHECK_INTERVAL_MS = 5000;

function looksLikePlaceholderCoverUrl(value: string): boolean {
    if (!value) return false;

    let decoded = value;
    try {
        decoded = decodeURIComponent(value);
    } catch {
        // Keep the original value when it contains malformed escapes.
    }

    return /(?:placeholder|default|stub|fallback|no[-_ ]?cover|without[-_ ]?cover|empty[-_ ]?cover)/i.test(decoded);
}

function shouldForceFallbackCover(snapshot: Pick<PlayerSnapshot, "artists" | "album" | "coverUrl">): boolean {
    const artists = Array.isArray(snapshot.artists) ? snapshot.artists : [];
    const onlyPulseSyncArtist = artists.length > 0
        && artists.every(name => /^pulse\s*sync$/i.test(String(name).trim()));

    return !snapshot.coverUrl?.trim()
        || looksLikePlaceholderCoverUrl(snapshot.coverUrl)
        || (onlyPulseSyncArtist && !snapshot.album?.trim());
}

function waitForImage(source: string): Promise<boolean> {
    return new Promise(resolve => {
        const image = new Image();
        let settled = false;
        const finish = (available: boolean) => {
            if (settled) return;
            settled = true;
            resolve(available);
        };

        const timeout = window.setTimeout(() => finish(false), 4500);
        image.onload = () => {
            window.clearTimeout(timeout);
            finish(image.naturalWidth > 0 && image.naturalHeight > 0);
        };
        image.onerror = () => {
            window.clearTimeout(timeout);
            finish(false);
        };
        image.src = source;
    });
}

function TrackCoverImage({
    coverUrl,
    title,
    className = "",
    forceFallback = false,
    onAccentColor
}: {
    coverUrl: string;
    title: string;
    className?: string;
    forceFallback?: boolean;
    onAccentColor?: (color: string) => void;
}) {
    const text = usePlayerText();
    const primaryUrl = forceFallback || looksLikePlaceholderCoverUrl(coverUrl)
        ? ""
        : normalizeCoverRemoteUrl(coverUrl);
    const [primarySource, setPrimarySource] = useState("");
    const [fallbackSource, setFallbackSource] = useState("");
    const [showingFallback, setShowingFallback] = useState(true);
    const [primaryCheckRevision, setPrimaryCheckRevision] = useState(0);
    const [fallbackCheckRevision, setFallbackCheckRevision] = useState(0);

    // Restore the original remotely hosted GIF, but download it in the native
    // process and pass it to Discord as a data URL. This keeps the exact former
    // animation without triggering renderer CSP or mixed-content blocking.
    useEffect(() => {
        let cancelled = false;

        void resolveCoverSource(FALLBACK_COVER_URL).then(async resolved => {
            if (cancelled) return;
            const available = resolved ? await waitForImage(resolved) : false;
            if (cancelled) return;
            setFallbackSource(available && resolved ? resolved : "");
        });

        return () => {
            cancelled = true;
        };
    }, [fallbackCheckRevision]);

    // Retry the original fallback every five seconds if the host was
    // temporarily unavailable when the component first appeared.
    useEffect(() => {
        if (fallbackSource) return;
        const timer = window.setInterval(() => {
            setFallbackCheckRevision(revision => revision + 1);
        }, COVER_RECHECK_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [fallbackSource]);

    // Never keep the previous track artwork while a new source is checked.
    useEffect(() => {
        setPrimarySource("");
        setShowingFallback(true);
        setPrimaryCheckRevision(0);
    }, [primaryUrl, forceFallback]);

    // Retry a failed real cover every five seconds. The Store also refreshes
    // snapshots, so a cover URL that appears later will be picked up as well.
    useEffect(() => {
        if (!primaryUrl || !showingFallback) return;

        const timer = window.setInterval(() => {
            setPrimaryCheckRevision(revision => revision + 1);
        }, COVER_RECHECK_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [primaryUrl, showingFallback]);

    useEffect(() => {
        let cancelled = false;

        if (!primaryUrl) {
            setPrimarySource("");
            setShowingFallback(true);
            return;
        }

        void resolveCoverSource(primaryUrl).then(async resolved => {
            if (cancelled) return;
            const available = resolved ? await waitForImage(resolved) : false;
            if (cancelled) return;

            if (available && resolved) {
                setPrimarySource(resolved);
                setShowingFallback(false);
            } else {
                setPrimarySource("");
                setShowingFallback(true);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [primaryUrl, primaryCheckRevision]);

    const source = showingFallback ? fallbackSource : primarySource;
    if (!source) return null;

    return (
        <img
            className={`vc-pulsesync-cover${className ? ` ${className}` : ""}`}
            src={source}
            alt={showingFallback ? `${text.coverMissing}: ${title}` : `${text.cover}: ${title}`}
            data-ymcontrols-fallback={showingFallback ? "true" : undefined}
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={event => {
                if (showingFallback) return;
                const color = deriveImageColor(event.currentTarget);
                if (color) onAccentColor?.(color);
            }}
            onError={() => {
                if (showingFallback) {
                    setFallbackSource("");
                    setFallbackCheckRevision(revision => revision + 1);
                    return;
                }

                setPrimarySource("");
                setShowingFallback(true);
            }}
        />
    );
}

interface CoverLayer {
    trackId: string;
    coverUrl: string;
    title: string;
    forceFallback: boolean;
}

function AnimatedTrackCover({
    snapshot,
    onClick,
    onAccentColor
}: {
    snapshot: PlayerSnapshot;
    onClick: () => void;
    onAccentColor: (color: string) => void;
}) {
    const text = usePlayerText();
    const [layers, setLayers] = useState<{ current: CoverLayer; previous: CoverLayer | null; }>({
        current: {
            trackId: snapshot.trackId,
            coverUrl: snapshot.coverUrl,
            title: snapshot.title,
            forceFallback: shouldForceFallbackCover(snapshot)
        },
        previous: null
    });

    useEffect(() => {
        const next = {
            trackId: snapshot.trackId,
            coverUrl: snapshot.coverUrl,
            title: snapshot.title,
            forceFallback: shouldForceFallbackCover(snapshot)
        };
        setLayers(previous => {
            if (previous.current.trackId === next.trackId
                && previous.current.coverUrl === next.coverUrl
                && previous.current.forceFallback === next.forceFallback) return previous;
            return { current: next, previous: previous.current };
        });
    }, [snapshot.trackId, snapshot.coverUrl, snapshot.title, snapshot.album, snapshot.artists.join("\u0000")]);

    useEffect(() => {
        if (!layers.previous) return;
        const timer = window.setTimeout(() => {
            setLayers(previous => previous.previous ? { ...previous, previous: null } : previous);
        }, 320);
        return () => window.clearTimeout(timer);
    }, [layers.previous?.trackId, layers.previous?.coverUrl]);

    return (
        <button
            type="button"
            className="vc-pulsesync-cover-button"
            aria-label={text.openExpandedPlayer}
            title={text.openExpandedPlayer}
            onClick={onClick}
        >
            {layers.previous && (
                <TrackCoverImage
                    key={`old-${layers.previous.trackId}-${layers.previous.coverUrl}`}
                    coverUrl={layers.previous.coverUrl}
                    title={layers.previous.title}
                    forceFallback={layers.previous.forceFallback}
                    className="vc-pulsesync-cover-layer vc-pulsesync-cover-outgoing"
                />
            )}
            <TrackCoverImage
                key={`new-${layers.current.trackId}-${layers.current.coverUrl}`}
                coverUrl={layers.current.coverUrl}
                title={layers.current.title}
                forceFallback={layers.current.forceFallback}
                className="vc-pulsesync-cover-layer vc-pulsesync-cover-incoming"
                onAccentColor={onAccentColor}
            />
        </button>
    );
}

const VOLUME_SEND_INTERVAL = 75;
const VOLUME_SETTLE_TIMEOUT = 6500;
const RANGE_ADJUSTMENT_KEYS = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "Home",
    "End"
]);

function capturePointer(event: React.PointerEvent<HTMLInputElement>): void {
    try {
        event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
        // Pointer capture can fail when the pointer has already been released.
    }
}

function releasePointer(event: React.PointerEvent<HTMLInputElement>): void {
    try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    } catch {
        // The browser also releases pointer capture automatically on pointerup.
    }
}

function useNonPassiveWheel(handler: (event: WheelEvent) => void) {
    const elementRef = useRef<HTMLDivElement>(null);
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;

        const listener = (event: WheelEvent) => handlerRef.current(event);
        element.addEventListener("wheel", listener, { passive: false });

        return () => element.removeEventListener("wheel", listener);
    }, []);

    return elementRef;
}

function ProgressSlider({ snapshot }: { snapshot: PlayerSnapshot; }) {
    const text = usePlayerText();
    const duration = Math.max(0, snapshot.durationMs);
    const initialPosition = clamp(PulseSyncStore.positionMs, 0, duration);
    const [position, setPosition] = useState(initialPosition);
    const [draftPosition, setDraftPosition] = useState<number | null>(null);
    const [dragging, setDragging] = useState(false);
    const positionRef = useRef(initialPosition);
    const draftRef = useRef<number | null>(null);
    const previousTrackRef = useRef(snapshot.trackId);

    useEffect(() => {
        const target = clamp(PulseSyncStore.positionMs, 0, duration);
        const trackChanged = previousTrackRef.current !== snapshot.trackId;
        previousTrackRef.current = snapshot.trackId;

        if (draftRef.current === null && (trackChanged || !snapshot.isPlaying)) {
            positionRef.current = target;
            setPosition(target);
        }
    }, [snapshot.trackId, snapshot.positionMs, snapshot.isPlaying, duration]);

    useEffect(() => {
        if (!snapshot.isPlaying || duration <= 0) return;

        let animationFrame = 0;
        const updatePosition = () => {
            if (draftRef.current === null) {
                const storePosition = clamp(PulseSyncStore.positionMs, 0, duration);
                const drift = storePosition - positionRef.current;
                const nextPosition = Math.abs(drift) > 1500
                    ? storePosition
                    : positionRef.current + drift * 0.38;

                positionRef.current = nextPosition;
                setPosition(nextPosition);
            }
            animationFrame = window.requestAnimationFrame(updatePosition);
        };

        animationFrame = window.requestAnimationFrame(updatePosition);
        return () => window.cancelAnimationFrame(animationFrame);
    }, [snapshot.trackId, snapshot.isPlaying, duration]);

    const setDraft = (rawValue: number) => {
        const value = clamp(Math.round(rawValue), 0, duration);
        draftRef.current = value;
        setDraftPosition(value);
    };

    const commit = (rawValue?: number) => {
        const pending = rawValue ?? draftRef.current;
        if (pending === null || duration <= 0) return;

        const value = clamp(Math.round(pending), 0, duration);
        draftRef.current = null;
        positionRef.current = value;
        setDraftPosition(null);
        setDragging(false);
        setPosition(value);
        PulseSyncStore.seek(value);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        const current = draftRef.current ?? positionRef.current;
        let target: number | null = null;

        switch (event.key) {
            case "ArrowLeft":
            case "ArrowDown":
                target = current - 5000;
                break;
            case "ArrowRight":
            case "ArrowUp":
                target = current + 5000;
                break;
            case "PageDown":
                target = current - 30000;
                break;
            case "PageUp":
                target = current + 30000;
                break;
            case "Home":
                target = 0;
                break;
            case "End":
                target = duration;
                break;
        }

        if (target === null) return;
        event.preventDefault();
        commit(target);
    };

    const handleWheel = (event: WheelEvent) => {
        if (!event.shiftKey || duration <= 0) return;
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        const current = draftRef.current ?? positionRef.current;
        commit(current + (event.deltaY < 0 ? 5000 : -5000));
    };
    const wheelTargetRef = useNonPassiveWheel(handleWheel);

    const displayedPosition = clamp(draftPosition ?? position, 0, duration);
    const progressPercent = duration > 0 ? displayedPosition / duration * 100 : 0;

    return (
        <div className="vc-pulsesync-progress-row">
            <span>{formatTime(displayedPosition)}</span>
            <div
                className="vc-pulsesync-range-shell vc-pulsesync-progress-range-shell"
                style={{ "--vc-pulsesync-progress": `${progressPercent}%` } as React.CSSProperties}
                data-dragging={dragging ? "true" : undefined}
                ref={wheelTargetRef}
            >
                <input
                    className="vc-pulsesync-range vc-pulsesync-progress-range"
                    type="range"
                    min={0}
                    max={Math.max(1, duration)}
                    step={1}
                    value={Math.min(displayedPosition, Math.max(1, duration))}
                    data-dragging={dragging ? "true" : undefined}
                    disabled={duration <= 0}
                    aria-label={text.trackPosition}
                    onChange={event => setDraft(Number(event.currentTarget.value))}
                    onPointerDown={event => {
                        setDragging(true);
                        setDraft(Number(event.currentTarget.value));
                        capturePointer(event);
                    }}
                    onPointerUp={event => {
                        commit(Number(event.currentTarget.value));
                        releasePointer(event);
                        event.currentTarget.blur();
                    }}
                    onPointerCancel={event => {
                        commit(Number(event.currentTarget.value));
                        releasePointer(event);
                        event.currentTarget.blur();
                    }}
                    onLostPointerCapture={event => {
                        if (draftRef.current !== null) commit(Number(event.currentTarget.value));
                    }}
                    onKeyDown={handleKeyDown}
                    onBlur={() => commit()}
                />
                <span className="vc-pulsesync-range-thumb" aria-hidden="true" />
            </div>
            <span>{formatTime(duration)}</span>
        </div>
    );
}

function getVolumeIcon(volume: number, muted: boolean): string {
    if (muted || volume <= 0) return ICONS.volumeMuted;
    if (volume <= 33) return ICONS.volumeLow;
    if (volume <= 66) return ICONS.volumeMedium;
    return ICONS.volumeHigh;
}

function VolumeSlider({ volume, muted }: { volume: number; muted: boolean; }) {
    const text = usePlayerText();
    const normalizedVolume = clamp(Math.round(volume), 0, 100);
    const [displayedVolume, setDisplayedVolume] = useState(normalizedVolume);
    const [dragging, setDragging] = useState(false);
    const pendingRef = useRef<number | null>(null);
    const expectedRef = useRef<number | null>(null);
    const queuedVolumeRef = useRef<number | null>(null);
    const lastSentVolumeRef = useRef(normalizedVolume);
    const sendTimerRef = useRef<number | null>(null);
    const settleTimerRef = useRef<number | null>(null);
    const wheelCommitTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (pendingRef.current !== null) return;

        const expected = expectedRef.current;
        if (expected !== null) {
            if (Math.abs(normalizedVolume - expected) <= 1) {
                expectedRef.current = null;
                if (settleTimerRef.current !== null) {
                    window.clearTimeout(settleTimerRef.current);
                    settleTimerRef.current = null;
                }
                lastSentVolumeRef.current = normalizedVolume;
                setDisplayedVolume(normalizedVolume);
            } else {
                setDisplayedVolume(expected);
            }
            return;
        }

        lastSentVolumeRef.current = normalizedVolume;
        setDisplayedVolume(normalizedVolume);
    }, [normalizedVolume]);

    useEffect(() => () => {
        if (sendTimerRef.current !== null) window.clearTimeout(sendTimerRef.current);
        if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
        if (wheelCommitTimerRef.current !== null) window.clearTimeout(wheelCommitTimerRef.current);
    }, []);

    const sendVolume = (value: number) => {
        if (lastSentVolumeRef.current === value) return;
        lastSentVolumeRef.current = value;
        PulseSyncStore.setVolume(value);
    };

    const queueVolume = (value: number) => {
        queuedVolumeRef.current = value;
        if (sendTimerRef.current !== null) return;

        sendTimerRef.current = window.setTimeout(() => {
            sendTimerRef.current = null;
            const queuedValue = queuedVolumeRef.current;
            queuedVolumeRef.current = null;
            if (queuedValue !== null) sendVolume(queuedValue);
        }, VOLUME_SEND_INTERVAL);
    };

    const setDraft = (rawValue: number) => {
        const value = clamp(Math.round(rawValue), 0, 100);
        pendingRef.current = value;
        setDisplayedVolume(value);
        queueVolume(value);
    };

    const commit = (rawValue?: number) => {
        const pending = rawValue ?? pendingRef.current;
        if (pending === null) return;

        const value = clamp(Math.round(pending), 0, 100);
        pendingRef.current = null;
        expectedRef.current = value;
        queuedVolumeRef.current = null;
        setDragging(false);
        setDisplayedVolume(value);

        if (sendTimerRef.current !== null) {
            window.clearTimeout(sendTimerRef.current);
            sendTimerRef.current = null;
        }
        sendVolume(value);

        if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = window.setTimeout(() => {
            if (expectedRef.current !== value) return;
            expectedRef.current = null;
            settleTimerRef.current = null;
            setDisplayedVolume(clamp(Math.round(PulseSyncStore.snapshot?.volume ?? value), 0, 100));
        }, VOLUME_SETTLE_TIMEOUT);
    };

    const handleWheel = (event: WheelEvent) => {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        const current = pendingRef.current ?? displayedVolume;
        const next = clamp(current + (event.deltaY < 0 ? 5 : -5), 0, 100);
        setDraft(next);

        if (wheelCommitTimerRef.current !== null) window.clearTimeout(wheelCommitTimerRef.current);
        wheelCommitTimerRef.current = window.setTimeout(() => {
            wheelCommitTimerRef.current = null;
            commit(next);
        }, 120);
    };
    const wheelTargetRef = useNonPassiveWheel(handleWheel);

    return (
        <div className="vc-pulsesync-volume-row" ref={wheelTargetRef}>
            <button
                type="button"
                className="vc-pulsesync-volume-button"
                aria-label={muted ? text.unmute : text.mute}
                aria-pressed={muted}
                title={muted ? text.unmute : text.mute}
                onClick={() => PulseSyncStore.toggleMute()}
            >
                <SvgIcon path={getVolumeIcon(displayedVolume, muted)} label={muted ? "muted" : "volume"} />
            </button>
            <div
                className="vc-pulsesync-range-shell vc-pulsesync-volume-range-shell"
                style={{ "--vc-pulsesync-progress": `${displayedVolume}%` } as React.CSSProperties}
                data-dragging={dragging ? "true" : undefined}
            >
                <input
                    className="vc-pulsesync-range vc-pulsesync-volume-range"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={displayedVolume}
                    data-dragging={dragging ? "true" : undefined}
                    aria-label={text.volume}
                    onChange={event => setDraft(Number(event.currentTarget.value))}
                    onPointerDown={event => {
                        setDragging(true);
                        expectedRef.current = null;
                        lastSentVolumeRef.current = normalizedVolume;
                        if (settleTimerRef.current !== null) {
                            window.clearTimeout(settleTimerRef.current);
                            settleTimerRef.current = null;
                        }
                        capturePointer(event);
                    }}
                    onPointerUp={event => {
                        commit(Number(event.currentTarget.value));
                        releasePointer(event);
                        event.currentTarget.blur();
                    }}
                    onPointerCancel={event => {
                        commit(Number(event.currentTarget.value));
                        releasePointer(event);
                        event.currentTarget.blur();
                    }}
                    onLostPointerCapture={event => {
                        if (pendingRef.current !== null) commit(Number(event.currentTarget.value));
                    }}
                    onKeyUp={event => {
                        if (RANGE_ADJUSTMENT_KEYS.has(event.key)) commit(Number(event.currentTarget.value));
                    }}
                    onBlur={() => commit()}
                />
                <span className="vc-pulsesync-range-thumb" aria-hidden="true" />
            </div>
            <span>{displayedVolume}%</span>
        </div>
    );
}

async function copyText(value: string): Promise<boolean> {
    if (!value) return false;
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch {
        const input = document.createElement("textarea");
        input.value = value;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        return copied;
    }
}

type ModalTab = "details" | "queue";

function QueuePanel({ snapshot }: { snapshot: PlayerSnapshot; }) {
    const text = usePlayerText();

    if (!snapshot.queue.length) {
        return (
            <div className="vc-pulsesync-empty-state">
                <SvgIcon path={ICONS.queue} label="queue" />
                <strong>{text.queueNotFound}</strong>
                <span>{text.queueUnavailable}</span>
            </div>
        );
    }

    return (
        <div className="vc-pulsesync-queue-list">
            {snapshot.queue.map((item, index) => {
                const current = index === snapshot.queueIndex;
                return (
                    <div className={`vc-pulsesync-queue-item${current ? " vc-pulsesync-queue-item-current" : ""}`} key={`${item.id}-${index}`}>
                        {(current || index === snapshot.queueIndex + 1) && (
                            <span className="vc-pulsesync-queue-position-label">
                                {current ? text.nowPlaying : text.nextTrack}
                            </span>
                        )}
                        <button
                            type="button"
                            className="vc-pulsesync-queue-main"
                            disabled={!snapshot.queueCanPlay || current}
                            onClick={() => PulseSyncStore.playQueueItem(item, index)}
                            title={current ? text.nowPlaying : text.playThisTrack}
                        >
                            <TrackCoverImage
                                coverUrl={item.coverUrl}
                                title={item.title}
                                forceFallback={!item.coverUrl?.trim() || looksLikePlaceholderCoverUrl(item.coverUrl)}
                                className="vc-pulsesync-queue-cover"
                            />
                            <span className="vc-pulsesync-queue-copy">
                                <strong>{item.title}</strong>
                                <span>{item.artists.join(", ") || item.album || text.yandexMusic}</span>
                            </span>
                            <span className="vc-pulsesync-queue-duration">{formatTime(item.durationMs)}</span>
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

function ExpandedPlayerModal({
    snapshot,
    appearance,
    initialTab,
    onClose,
    onAccentColor
}: {
    snapshot: PlayerSnapshot;
    appearance: PlayerAppearance;
    initialTab: ModalTab;
    onClose: () => void;
    onAccentColor: (color: string) => void;
}) {
    const text = usePlayerText();
    const [tab, setTab] = useState<ModalTab>(initialTab);
    const [copyStatus, setCopyStatus] = useState("");
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const trackUrl = buildTrackUrl(snapshot);
    const artistLinks = buildArtistLinks(snapshot);
    const albumUrl = normalizeUrl(snapshot.albumUrl);

    useEffect(() => setTab(initialTab), [initialTab]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        closeButtonRef.current?.focus();
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    const handleCopy = async () => {
        const copied = await copyText(trackUrl || `${snapshot.artists.join(", ")} — ${snapshot.title}`);
        setCopyStatus(copied ? text.copied : text.copyFailed);
        window.setTimeout(() => setCopyStatus(""), 1600);
    };

    return ReactDOM.createPortal(
        <div
            className={`vc-pulsesync-modal-backdrop ${getThemeClassName(appearance.lightForeground)}`}
            style={appearance.style}
            role="presentation"
            onMouseDown={event => event.target === event.currentTarget && onClose()}
        >
            <section className="vc-pulsesync-modal" role="dialog" aria-modal="true" aria-label={text.expandedPlayerLabel}>
                <header className="vc-pulsesync-modal-header">
                    <div>
                        <span className="vc-pulsesync-modal-kicker">YMControls</span>
                        <h2>{text.expandedPlayer}</h2>
                    </div>
                    <button ref={closeButtonRef} type="button" className="vc-pulsesync-modal-close" onClick={onClose} aria-label={text.close}>
                        <SvgIcon path={ICONS.close} label="close" />
                    </button>
                </header>

                <div className="vc-pulsesync-modal-hero" key={snapshot.trackId}>
                    <TrackCoverImage
                        coverUrl={snapshot.coverUrl}
                        title={snapshot.title}
                        forceFallback={shouldForceFallbackCover(snapshot)}
                        className="vc-pulsesync-modal-cover"
                        onAccentColor={onAccentColor}
                    />
                    <div className="vc-pulsesync-modal-track">
                        <h3>{snapshot.title}</h3>
                        <div className="vc-pulsesync-modal-artists">
                            {artistLinks.map((artist, index) => (
                                <React.Fragment key={`${artist.name}-${artist.url}-${index}`}>
                                    {index > 0 && <span>, </span>}
                                    <a href={artist.url} target="_blank" rel="noreferrer noopener">{artist.name}</a>
                                </React.Fragment>
                            ))}
                        </div>
                        {snapshot.album && (
                            albumUrl
                                ? <a className="vc-pulsesync-modal-album" href={albumUrl} target="_blank" rel="noreferrer noopener">{snapshot.album}</a>
                                : <span className="vc-pulsesync-modal-album">{snapshot.album}</span>
                        )}

                        <div className="vc-pulsesync-modal-facts">
                            {snapshot.year && <span><strong>{text.year}</strong>{snapshot.year}</span>}
                            <span><strong>{text.duration}</strong>{formatTime(snapshot.durationMs)}</span>
                        </div>

                        <div className="vc-pulsesync-modal-actions">
                            {trackUrl && (
                                <a className="vc-pulsesync-action" href={trackUrl} target="_blank" rel="noreferrer noopener">
                                    <SvgIcon path={ICONS.external} label="open" />
                                    {text.openTrack}
                                </a>
                            )}
                            {albumUrl && (
                                <a className="vc-pulsesync-action" href={albumUrl} target="_blank" rel="noreferrer noopener">
                                    <SvgIcon path={ICONS.external} label="open album" />
                                    {text.openAlbum}
                                </a>
                            )}
                            {artistLinks[0]?.url && (
                                <a className="vc-pulsesync-action" href={artistLinks[0].url} target="_blank" rel="noreferrer noopener">
                                    <SvgIcon path={ICONS.external} label="open artist" />
                                    {text.openArtist}
                                </a>
                            )}
                            <button type="button" className="vc-pulsesync-action" onClick={handleCopy}>
                                <SvgIcon path={ICONS.copy} label="copy" />
                                {copyStatus || text.copyLink}
                            </button>
                        </div>
                    </div>
                </div>

                <nav className="vc-pulsesync-modal-tabs" aria-label={text.modalSections}>
                    <button type="button" className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>{text.details}</button>
                    <button type="button" className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>
                        {text.queue}{snapshot.queue.length ? ` · ${snapshot.queue.length}` : ""}
                    </button>
                </nav>

                <div className="vc-pulsesync-modal-content">
                    {tab === "details" && (
                        <div className="vc-pulsesync-details-grid">
                            <div><strong>{text.title}</strong><span>{snapshot.title}</span></div>
                            <div><strong>{text.artists}</strong><span>{snapshot.artists.join(", ") || "—"}</span></div>
                            <div><strong>{text.album}</strong><span>{snapshot.album || "—"}</span></div>
                        </div>
                    )}
                    {tab === "queue" && <QueuePanel snapshot={snapshot} />}
                </div>
            </section>
        </div>,
        document.body
    );
}

export function PulseSyncPlayer() {
    const { showDisconnected, showVolume, backgroundColor, themeMode, colorizeClient, language } = settings.use([
        "showDisconnected",
        "showVolume",
        "backgroundColor",
        "themeMode",
        "colorizeClient",
        "language"
    ]);
    const text = UI_TEXT[(language as Language) === "ru" ? "ru" : "en"];
    const discordTheme = useStateFromStores([ThemeStore], () => ThemeStore.theme);
    const state = useStateFromStores([PulseSyncStore], () => ({
        connected: PulseSyncStore.connected,
        serverRunning: PulseSyncStore.serverRunning,
        lastError: PulseSyncStore.lastError,
        snapshot: PulseSyncStore.snapshot,
        protocolMode: PulseSyncStore.protocolMode
    }));
    const [modalTab, setModalTab] = useState<ModalTab | null>(null);
    const [localAccentColor, setLocalAccentColor] = useState("");
    const snapshot = state.snapshot;

    // Explicitly refresh metadata every five seconds so a cover that appears
    // after playback starts is picked up even when PulseSync initially reported
    // an empty or placeholder artwork value.
    useEffect(() => {
        if (!state.connected) return;
        const timer = window.setInterval(() => void PulseSyncStore.requestState(), COVER_RECHECK_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [state.connected]);
    const selectedThemeMode = (themeMode as ThemeMode) || "custom";
    const discordThemeIsLight = discordTheme === "light";
    const resolvedAccentColor = snapshot?.accentColor || localAccentColor;
    const clientThemeColor = normalizeHex(resolvedAccentColor) ?? DEFAULT_BACKGROUND_COLOR;
    const clientColorModeActive = Boolean(
        colorizeClient
        && snapshot?.colorAddonActive
        && normalizeHex(snapshot.accentColor)
    );
    const appearance = getPlayerAppearance(
        clientColorModeActive ? "cover" : selectedThemeMode,
        clientColorModeActive ? DEFAULT_BACKGROUND_COLOR : backgroundColor,
        resolvedAccentColor,
        discordThemeIsLight
    );

    useEffect(() => {
        const rootElement = document.documentElement;
        const clearClientTheme = () => {
            rootElement.removeAttribute(CLIENT_THEME_ATTRIBUTE);
            rootElement.style.removeProperty(CLIENT_THEME_COLOR_PROPERTY);
        };
        if (!clientColorModeActive) {
            clearClientTheme();
            return clearClientTheme;
        }

        const applyClientTheme = () => {
            if (rootElement.getAttribute(CLIENT_THEME_ATTRIBUTE) !== "true") {
                rootElement.setAttribute(CLIENT_THEME_ATTRIBUTE, "true");
            }
            if (rootElement.style.getPropertyValue(CLIENT_THEME_COLOR_PROPERTY) !== clientThemeColor) {
                rootElement.style.setProperty(CLIENT_THEME_COLOR_PROPERTY, clientThemeColor);
            }
        };
        const restoreVisibleTheme = () => {
            if (!document.hidden) applyClientTheme();
        };

        applyClientTheme();
        const rootObserver = new MutationObserver(applyClientTheme);
        rootObserver.observe(rootElement, {
            attributes: true,
            attributeFilter: [CLIENT_THEME_ATTRIBUTE, "style"]
        });
        window.addEventListener("focus", applyClientTheme);
        document.addEventListener("visibilitychange", restoreVisibleTheme);

        return () => {
            rootObserver.disconnect();
            window.removeEventListener("focus", applyClientTheme);
            document.removeEventListener("visibilitychange", restoreVisibleTheme);
            clearClientTheme();
        };
    }, [clientColorModeActive, clientThemeColor]);

    useEffect(() => {
        setLocalAccentColor("");
    }, [snapshot?.trackId]);

    if (!state.connected) {
        return showDisconnected
            ? <DisconnectedPanel serverRunning={state.serverRunning} error={state.lastError} appearance={appearance} />
            : null;
    }

    if (!snapshot) {
        return (
            <div className={getPlayerClassName(appearance.lightForeground, "vc-pulsesync-offline")} style={appearance.style} role="status">
                <div className="vc-pulsesync-offline-copy">
                    <strong>{text.connected}</strong>
                    <span>{text.waitingState}</span>
                </div>
            </div>
        );
    }

    const trackUrl = buildTrackUrl(snapshot);
    const artistLinks = buildArtistLinks(snapshot);

    return (
        <>
            <section className={getPlayerClassName(appearance.lightForeground)} style={appearance.style} aria-label={text.playerLabel}>
                <div className="vc-pulsesync-info-row">
                    <AnimatedTrackCover
                        snapshot={snapshot}
                        onClick={() => setModalTab("details")}
                        onAccentColor={setLocalAccentColor}
                    />

                    <div className="vc-pulsesync-track-copy vc-pulsesync-track-change" key={snapshot.trackId}>
                        <div className="vc-pulsesync-title-line">
                            <MetaLink href={trackUrl} className="vc-pulsesync-title vc-pulsesync-title-link" title={snapshot.title}>
                                {snapshot.title}
                            </MetaLink>
                        </div>

                        <div className="vc-pulsesync-subtitle" title={[snapshot.artists.join(", "), snapshot.album].filter(Boolean).join(" · ")}>
                            <span className="vc-pulsesync-artists">
                                {artistLinks.map((artist, index) => (
                                    <React.Fragment key={`${artist.name}-${artist.url}-${index}`}>
                                        {index > 0 && <span className="vc-pulsesync-separator">, </span>}
                                        <MetaLink href={artist.url} className="vc-pulsesync-artist-link" title={artist.name}>
                                            {artist.name}
                                        </MetaLink>
                                    </React.Fragment>
                                ))}
                            </span>
                            {snapshot.album && (
                                <>
                                    <span className="vc-pulsesync-separator"> · </span>
                                    <span className="vc-pulsesync-album" title={snapshot.album}>{snapshot.album}</span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="vc-pulsesync-header-actions">
                        <ControlButton
                            className="vc-pulsesync-queue-button"
                            aria-label={text.openQueue}
                            title={text.openQueue}
                            onClick={() => setModalTab("queue")}
                        >
                            <SvgIcon path={ICONS.queue} label="queue" />
                            {snapshot.queue.length > 0 && <span className="vc-pulsesync-queue-badge">{Math.min(snapshot.queue.length, 99)}</span>}
                        </ControlButton>
                        <ControlButton
                            className={`vc-pulsesync-like${snapshot.liked ? " vc-pulsesync-like-liked" : ""}`}
                            aria-label={snapshot.liked ? text.removeFromFavorites : text.addToFavorites}
                            aria-pressed={snapshot.liked}
                            title={snapshot.liked ? text.removeFromFavorites : text.addToFavorites}
                            onClick={() => PulseSyncStore.toggleLike()}
                        >
                            {snapshot.liked ? (
                                <SvgIcon path={ICONS.heartFilled} label="like" />
                            ) : (
                                <SvgIcon path={ICONS.heartOutline} label="like" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
                            )}
                        </ControlButton>
                    </div>
                </div>

                <ProgressSlider key={snapshot.trackId || snapshot.title} snapshot={snapshot} />

                <div className="vc-pulsesync-controls">
                    <ControlButton active={snapshot.shuffle} aria-label={text.shuffle} aria-pressed={snapshot.shuffle} title={text.shuffle} onClick={() => PulseSyncStore.toggleShuffle()}>
                        <SvgIcon path={ICONS.shuffle} label="shuffle" fillRule="evenodd" clipRule="evenodd" />
                    </ControlButton>

                    <ControlButton aria-label={text.previousTrack} title={text.previousTrack} onClick={() => PulseSyncStore.previous()}>
                        <SvgIcon path={ICONS.previous} label="previous" />
                    </ControlButton>

                    <ControlButton className="vc-pulsesync-play" aria-label={snapshot.isPlaying ? text.pause : text.play} title={snapshot.isPlaying ? text.pause : text.play} onClick={() => PulseSyncStore.playPause()}>
                        <SvgIcon path={snapshot.isPlaying ? ICONS.pause : ICONS.play} label={snapshot.isPlaying ? "pause" : "play"} />
                    </ControlButton>

                    <ControlButton aria-label={text.nextTrack} title={text.nextTrack} onClick={() => PulseSyncStore.next()}>
                        <SvgIcon path={ICONS.next} label="next" />
                    </ControlButton>

                    <ControlButton className="vc-pulsesync-repeat" active={snapshot.repeat !== "off"} aria-label={`${text.repeat}: ${text.repeatModes[snapshot.repeat]}`} aria-pressed={snapshot.repeat !== "off"} title={`${text.repeat}: ${text.repeatModes[snapshot.repeat]}`} onClick={() => PulseSyncStore.cycleRepeat()}>
                        <SvgIcon path={snapshot.repeat === "one" ? ICONS.repeatOne : ICONS.repeat} label="repeat" fillRule="evenodd" clipRule="evenodd" />
                    </ControlButton>

                    <ControlButton aria-label={text.settings} title={text.settings} onClick={openYMControlsSettings}>
                        <CogWheel width={20} height={20} aria-hidden="true" />
                    </ControlButton>
                </div>

                {showVolume && state.protocolMode === "v1" && (
                    <VolumeSlider volume={snapshot.volume} muted={snapshot.muted} />
                )}
            </section>

            {modalTab && (
                <ExpandedPlayerModal
                    snapshot={snapshot}
                    appearance={appearance}
                    initialTab={modalTab}
                    onClose={() => setModalTab(null)}
                    onAccentColor={setLocalAccentColor}
                />
            )}
        </>
    );
}
