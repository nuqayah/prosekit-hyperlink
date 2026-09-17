import { type Editor } from 'prosekit/core';
import { type Readable } from 'svelte/store';
import type { HyperlinkDecision } from '../policy.js';
import { type HyperlinkUIState, type OpenLinkPopoverOptions } from '../state.js';
export type HyperlinkViewState = HyperlinkUIState & {
    active: boolean;
    href: string;
    text: string;
    canEditText: boolean;
    canSetText: boolean;
};
export interface ApplyHyperlinkInput {
    href: string;
    text?: string;
    attrs?: Record<string, unknown>;
}
export interface ApplyHyperlinkResult {
    applied: boolean;
    decision: HyperlinkDecision;
}
export interface NavigateHyperlinkOptions {
    target?: string;
}
export interface UseHyperlinkResult {
    editor: Editor;
    state: Readable<HyperlinkViewState>;
    openCreate(options?: Omit<OpenLinkPopoverOptions, 'mode'>): boolean;
    openPreview(): boolean;
    openEdit(): boolean;
    close(): boolean;
    apply(input: ApplyHyperlinkInput): ApplyHyperlinkResult;
    unlink(): boolean;
    copy(): Promise<boolean>;
    navigate(options?: NavigateHyperlinkOptions): boolean;
}
/**
 * Complete reactive Svelte access to the headless extension. Pass an editor
 * explicitly, or call it inside a ProseKit Svelte context.
 */
export declare function useHyperlink(editor?: Editor): UseHyperlinkResult;
