import { type PlainExtension } from 'prosekit/core';
import type { HyperlinkPasteTransform, LinkAttrs } from './hyperlink.js';
import type { HyperlinkPolicy } from './policy.js';
export interface HyperlinkInteractionOptions {
    policy: HyperlinkPolicy;
    defaultAttributes: Omit<LinkAttrs, 'href'>;
    autolink: boolean;
    markdownShortcut: boolean;
    linkOnPaste: boolean;
    transformPastedSlice?: HyperlinkPasteTransform;
    openOnClick: boolean;
    selectOnClick: boolean;
    exitable: boolean;
}
export declare function defineHyperlinkInteractions(options: HyperlinkInteractionOptions): PlainExtension;
