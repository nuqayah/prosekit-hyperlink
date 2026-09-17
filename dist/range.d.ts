import type { Mark, MarkType, ProseMirrorNode } from 'prosekit/pm/model';
import type { EditorState } from 'prosekit/pm/state';
export interface ActiveHyperlinkRange {
    from: number;
    to: number;
    mark: Mark;
}
export declare function getActiveLink(state: EditorState, position?: number): ActiveHyperlinkRange | null;
export declare function selectionAllowsMark(state: EditorState, type: MarkType): boolean;
export declare function isSimpleTextRange(doc: ProseMirrorNode, from: number, to: number): boolean;
