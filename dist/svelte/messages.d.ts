import type { HyperlinkFailureReason } from '../policy.js';
export interface HyperlinkMessages {
    addLink: string;
    editLink: string;
    linkDetails: string;
    url: string;
    text: string;
    apply: string;
    cancel: string;
    back: string;
    open: string;
    copy: string;
    copied: string;
    unlink: string;
    failures: Record<HyperlinkFailureReason, string>;
}
export type HyperlinkMessageOverrides = Partial<Omit<HyperlinkMessages, 'failures'>> & {
    failures?: Partial<Record<HyperlinkFailureReason, string>>;
};
export declare const defaultHyperlinkMessages: HyperlinkMessages;
export declare function resolveHyperlinkMessages(overrides?: HyperlinkMessageOverrides): HyperlinkMessages;
