import { type Extension } from 'prosekit/core';
import { PluginKey, type EditorState } from 'prosekit/pm/state';
import { type HyperlinkPolicy } from './policy.js';
export type HyperlinkPopoverMode = 'create' | 'preview' | 'edit';
export type HyperlinkPopoverTrigger = 'keyboard' | 'toolbar' | 'click' | 'programmatic';
export interface HyperlinkRange {
    from: number;
    to: number;
}
export type HyperlinkUIState = {
    mode: 'closed';
} | {
    mode: HyperlinkPopoverMode;
    range: HyperlinkRange;
    attrs: Record<string, unknown>;
    text: string;
    trigger: HyperlinkPopoverTrigger;
};
export interface OpenLinkPopoverOptions {
    mode?: HyperlinkPopoverMode;
    attrs?: Record<string, unknown>;
    trigger?: HyperlinkPopoverTrigger;
}
export interface HyperlinkStateOptions {
    shortcut?: string | false;
    policy?: HyperlinkPolicy;
}
export type HyperlinkStateExtension = Extension<{
    Commands: {
        openLinkPopover: [options?: OpenLinkPopoverOptions];
        closeLinkPopover: [];
    };
}>;
export declare const hyperlinkPluginKey: PluginKey<HyperlinkUIState>;
export declare function getHyperlinkState(state: EditorState): HyperlinkUIState;
export declare function getHyperlinkPolicy(state: EditorState): HyperlinkPolicy | null;
export declare function defineHyperlinkState({ shortcut, policy, }?: HyperlinkStateOptions): HyperlinkStateExtension;
export declare function normalizeHyperlinkHref(state: EditorState, href: unknown, source: 'copy' | 'navigate'): string | null;
