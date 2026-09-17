import { type HyperlinkOptions } from './hyperlink.js';
/**
 * ProseKit's basic extension with its native link extension replaced by this
 * package's safe hyperlink extension.
 */
export declare function defineBasicExtensionWithHyperlink(hyperlink?: HyperlinkOptions): import("prosekit/core").Union<readonly [import("prosekit/extensions/doc").DocExtension, import("prosekit/extensions/text").TextExtension, import("prosekit/extensions/paragraph").ParagraphExtension, import("prosekit/extensions/heading").HeadingExtension, import("prosekit/extensions/list").ListExtension, import("prosekit/extensions/blockquote").BlockquoteExtension, import("prosekit/extensions/image").ImageExtension, import("prosekit/extensions/horizontal-rule").HorizontalRuleExtension, import("prosekit/extensions/hard-break").HardBreakExtension, import("prosekit/extensions/table").TableExtension, import("prosekit/extensions/code-block").CodeBlockExtension, import("prosekit/extensions/italic").ItalicExtension, import("prosekit/extensions/bold").BoldExtension, import("prosekit/extensions/underline").UnderlineExtension, import("prosekit/extensions/strike").StrikeExtension, import("prosekit/extensions/code").CodeExtension, import("prosekit/core").Union<readonly [import("prosekit/core").Extension<{
    Marks: {
        link: import("./hyperlink.js").LinkAttrs;
    };
}>, import("prosekit/core").Union<readonly [import("prosekit/core").Extension<{
    Commands: {
        addLink: [attrs: import("./hyperlink.js").SetLinkAttrs, text?: string | undefined];
        removeLink: [];
        toggleLink: [attrs: import("./hyperlink.js").SetLinkAttrs, text?: string | undefined];
        expandLink: [];
        updateLink: [update: import("./hyperlink.js").UpdateLinkOptions];
    };
}>, import("./state.js").HyperlinkStateExtension, import("prosekit/core").PlainExtension]>]>, import("prosekit/core").PlainExtension, import("prosekit/core").BaseCommandsExtension, import("prosekit/core").HistoryExtension, import("prosekit/core").PlainExtension, import("prosekit/core").PlainExtension, import("prosekit/core").PlainExtension]>;
