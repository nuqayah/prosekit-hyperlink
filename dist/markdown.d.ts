import { MarkdownParser, MarkdownSerializer, type ParseSpec } from 'prosemirror-markdown';
import { type HyperlinkPolicy, type HyperlinkPolicyOptions } from './policy.js';
export interface HyperlinkMarkdownOptions {
    policy?: HyperlinkPolicy;
    policyOptions?: HyperlinkPolicyOptions;
    defaultAttributes?: Record<string, unknown>;
}
type MarkSerializerSpec = MarkdownSerializer['marks'][string];
/**
 * Wrap an existing parser without mutating it. Link tokens are normalized
 * before ProseMirror sees them; rejected links keep their visible content but
 * lose the mark.
 */
export declare function createHyperlinkMarkdownParser(base: MarkdownParser, options?: HyperlinkMarkdownOptions): MarkdownParser;
/** Build the `link` token spec for a custom parser composition. */
export declare function createHyperlinkMarkdownParseSpec(policy?: HyperlinkPolicy, defaultAttributes?: Record<string, unknown>): ParseSpec;
/** Replace only the link mark serializer in an existing composition. */
export declare function createHyperlinkMarkdownSerializer(base: MarkdownSerializer, options?: HyperlinkMarkdownOptions): MarkdownSerializer;
/** Build the link mark serializer for a custom serializer composition. */
export declare function createHyperlinkMarkdownMarkSpec(policy?: HyperlinkPolicy): MarkSerializerSpec;
export {};
