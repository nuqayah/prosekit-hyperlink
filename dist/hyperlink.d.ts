import type { Attrs, Slice } from 'prosekit/pm/model';
import { type HyperlinkPolicy, type HyperlinkPolicyOptions } from './policy.js';
export { getActiveLink, type ActiveHyperlinkRange } from './range.js';
export interface LinkAttrs extends Attrs {
    href: string;
    target: string | null;
    rel: string | null;
}
export interface SetLinkAttrs extends Partial<Omit<LinkAttrs, 'href'>> {
    href: string;
    [key: string]: unknown;
}
export interface UpdateLinkOptions {
    href?: string;
    text?: string;
    attrs?: Record<string, unknown>;
}
export type HyperlinkPasteTransform = (slice: Slice) => Slice;
export interface HyperlinkOptions {
    policy?: HyperlinkPolicy;
    policyOptions?: HyperlinkPolicyOptions;
    allowLegacyHref?: boolean;
    defaultAttributes?: Partial<Omit<LinkAttrs, 'href'>>;
    HTMLAttributes?: Record<string, string | null>;
    shortcut?: string | false;
    autolink?: boolean;
    markdownShortcut?: boolean;
    linkOnPaste?: boolean;
    transformPastedSlice?: HyperlinkPasteTransform;
    openOnClick?: boolean;
    selectOnClick?: boolean;
    exitable?: boolean;
}
export declare function defineHyperlink(options?: HyperlinkOptions): import("prosekit/core").Union<readonly [import("prosekit/core").Extension<{
    Marks: {
        link: LinkAttrs;
    };
}>, import("prosekit/core").Union<readonly [import("prosekit/core").Extension<{
    Commands: {
        addLink: [attrs: SetLinkAttrs, text?: string | undefined];
        removeLink: [];
        toggleLink: [attrs: SetLinkAttrs, text?: string | undefined];
        expandLink: [];
        updateLink: [update: UpdateLinkOptions];
    };
}>, import("./state.js").HyperlinkStateExtension, import("prosekit/core").PlainExtension]>]>;
export type HyperlinkExtension = ReturnType<typeof defineHyperlink>;
