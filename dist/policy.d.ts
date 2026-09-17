export type HyperlinkSource = 'command' | 'autolink' | 'paste' | 'markdown' | 'parse' | 'render' | 'navigate' | 'copy';
export interface HyperlinkContext {
    source?: HyperlinkSource;
}
export type HyperlinkKind = 'url' | 'email' | 'phone' | 'relative' | 'protocol';
export type HyperlinkFailureReason = 'empty' | 'too_long' | 'unsafe_scheme' | 'unsupported_scheme' | 'invalid_url' | 'invalid_email' | 'invalid_phone' | 'rejected';
export interface AcceptedHyperlink {
    ok: true;
    input: string;
    href: string;
    kind: HyperlinkKind;
}
export interface RejectedHyperlink {
    ok: false;
    reason: HyperlinkFailureReason;
}
export type HyperlinkDecision = AcceptedHyperlink | RejectedHyperlink;
export interface HyperlinkMatch extends AcceptedHyperlink {
    from: number;
    to: number;
    text: string;
}
export interface HyperlinkProtocol {
    scheme: string;
    validate?: RegExp | ((href: string, context: HyperlinkContext) => boolean);
    normalize?: (href: string) => string;
    autolink?: boolean;
}
export interface HyperlinkPolicyOptions {
    defaultProtocol?: 'http' | 'https';
    allowRelative?: boolean;
    allowProtocolRelative?: boolean;
    maxLength?: number;
    detect?: {
        urls?: boolean;
        emails?: boolean;
        phones?: boolean;
    };
    protocols?: readonly HyperlinkProtocol[];
    validate?: (decision: AcceptedHyperlink, context: HyperlinkContext) => boolean;
    shouldAutoLink?: (decision: AcceptedHyperlink, context: HyperlinkContext) => boolean;
}
export interface HyperlinkPolicy {
    normalize(input: string, context?: HyperlinkContext): HyperlinkDecision;
    find(text: string, context?: HyperlinkContext): readonly HyperlinkMatch[];
}
export declare function createHyperlinkPolicy(options?: HyperlinkPolicyOptions): HyperlinkPolicy;
