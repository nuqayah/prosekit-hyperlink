import type { VirtualElement } from '@floating-ui/dom';
import type { Editor } from 'prosekit/core';
import type { ActionReturn } from 'svelte/action';
export type DocumentRange = {
    from: number;
    to: number;
};
export declare function createRangeReference(editor: Editor, range: DocumentRange): VirtualElement | null;
export declare function portal(node: HTMLElement, target?: HTMLElement | false): ActionReturn<HTMLElement | false | undefined>;
