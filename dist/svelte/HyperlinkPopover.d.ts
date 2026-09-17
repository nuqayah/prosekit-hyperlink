import type { Placement } from '@floating-ui/dom';
import type { Editor } from 'prosekit/core';
import type { Component } from 'svelte';
import type { HyperlinkMessageOverrides } from './messages.js';
export interface HyperlinkPopoverProps {
    editor?: Editor;
    messages?: HyperlinkMessageOverrides;
    class?: string;
    dir?: 'ltr' | 'rtl' | 'auto';
    placement?: Placement;
    portalTarget?: HTMLElement | false;
    showArrow?: boolean;
}
export declare const HyperlinkPopover: Component<HyperlinkPopoverProps>;
