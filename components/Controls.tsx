/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { classNameFactory } from "@utils/css";
import { makeLazy } from "@utils/lazy";
import { Button, React, Slider, Tooltip, useEffect, useRef, useState, useStateFromStores } from "@webpack/common";

import { ICONS, TEXT } from "../constants";
import { YMusicSyncStore } from "../store";
import type { PlayerSnapshot } from "../types";

export const cl = classNameFactory("vc-ymsync-");

function formatTime(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const tail = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return hours > 0 ? `${hours}:${tail}` : tail;
}

export function Icon({ path }: { path: string; }) {
    return (
        <svg className={cl("icon")} viewBox="0 0 24 24" aria-hidden focusable={false}>
            <path d={path} fill="currentColor" />
        </svg>
    );
}

// Discord's Button typings only advertise FILLED/LINK, but the runtime component
// still accepts the chrome-less BLANK look used by panel buttons.
const blankLook = makeLazy(() => {
    const looks = Button.Looks as Record<string, string>;
    return looks.BLANK ?? looks.LINK;
});

interface PanelButtonProps {
    label: string;
    onClick(event: React.MouseEvent): void;
    children: React.ReactNode;
    active?: boolean;
    primary?: boolean;
    disabled?: boolean;
}

export function PanelButton({ label, onClick, children, active = false, primary = false, disabled = false }: PanelButtonProps) {
    return (
        <Tooltip text={label}>
            {tooltipProps => (
                <Button
                    {...tooltipProps}
                    aria-label={label}
                    size={Button.Sizes.NONE}
                    look={blankLook()}
                    color={Button.Colors.TRANSPARENT}
                    className={cl("btn", { "btn-primary": primary, "btn-active": active })}
                    disabled={disabled}
                    onClick={(event: React.MouseEvent) => {
                        tooltipProps.onClick?.();
                        onClick(event);
                    }}
                >
                    {children}
                </Button>
            )}
        </Tooltip>
    );
}

export function IconButton({ path, ...props }: { path: string; } & Omit<PanelButtonProps, "children">) {
    return (
        <PanelButton {...props}>
            <Icon path={path} />
        </PanelButton>
    );
}

// Discord's Slider is uncontrolled: remounting it is how an external value change
// is reflected. The key is frozen while the user drags the handle.
function useLiveKey(intervalMs: number, live: boolean): [string, (dragging: boolean) => void] {
    const [tick, setTick] = useState(0);
    const [frozenKey, setFrozenKey] = useState<string | null>(null);
    const draggingRef = useRef(false);

    useEffect(() => {
        if (!live) return;
        const timer = window.setInterval(() => {
            if (!draggingRef.current) setTick(current => current + 1);
        }, intervalMs);
        return () => window.clearInterval(timer);
    }, [live, intervalMs]);

    const key = frozenKey ?? String(tick);

    return [key, (dragging: boolean) => {
        draggingRef.current = dragging;
        setFrozenKey(dragging ? key : null);
    }];
}

export function ProgressSlider({ snapshot, disabled }: { snapshot: PlayerSnapshot; disabled: boolean; }) {
    const position = useStateFromStores([YMusicSyncStore], () => YMusicSyncStore.positionMs);
    const duration = Math.max(1, snapshot.durationMs);
    const [key, setDragging] = useLiveKey(1000, snapshot.isPlaying);

    return (
        <div className={cl("progress")}>
            <div
                className={cl("progress-track")}
                onPointerDown={() => setDragging(true)}
                onPointerUp={() => setDragging(false)}
                onPointerCancel={() => setDragging(false)}
            >
                <Slider
                    key={`${snapshot.trackId}-${key}`}
                    aria-label={TEXT.trackPosition}
                    disabled={disabled}
                    mini
                    hideBubble
                    initialValue={Math.min(position, duration)}
                    minValue={0}
                    maxValue={duration}
                    keyboardStep={5000}
                    onValueRender={(value: number) => formatTime(value)}
                    onValueChange={(value: number) => YMusicSyncStore.seek(value)}
                />
            </div>
            <div className={cl("progress-times")}>
                <BaseText size="xs" color="text-muted" className={cl("time")}>
                    {formatTime(position)}
                </BaseText>
                <BaseText size="xs" color="text-muted" className={cl("time")}>
                    {formatTime(snapshot.durationMs)}
                </BaseText>
            </div>
        </div>
    );
}

function volumeIcon(volume: number): string {
    if (volume <= 0) return ICONS.volumeMuted;
    return volume < 50 ? ICONS.volumeLow : ICONS.volumeHigh;
}

export function VolumeSlider({ snapshot, disabled }: { snapshot: PlayerSnapshot; disabled: boolean; }) {
    return (
        <div className={cl("volume")}>
            <IconButton
                label={snapshot.volume <= 0 ? TEXT.unmute : TEXT.mute}
                path={volumeIcon(snapshot.volume)}
                onClick={() => YMusicSyncStore.toggleMute()}
                disabled={disabled}
            />
            <div className={cl("volume-track")}>
                <Slider
                    key={`volume-${snapshot.volume}`}
                    aria-label={TEXT.volume}
                    disabled={disabled}
                    mini
                    initialValue={snapshot.volume}
                    minValue={0}
                    maxValue={100}
                    onValueRender={(value: number) => `${Math.round(value)}%`}
                    onValueChange={(value: number) => YMusicSyncStore.setVolume(value)}
                />
            </div>
        </div>
    );
}
