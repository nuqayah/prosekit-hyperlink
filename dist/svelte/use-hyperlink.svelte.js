import { defineUpdateHandler } from 'prosekit/core';
import { TextSelection } from 'prosekit/pm/state';
import { useEditor } from 'prosekit/svelte';
import { get, readable } from 'svelte/store';
import { getActiveLink, isSimpleTextRange } from '../range.js';
import { getHyperlinkPolicy, getHyperlinkState, normalizeHyperlinkHref, } from '../state.js';
const REJECTED = { ok: false, reason: 'rejected' };
/**
 * Complete reactive Svelte access to the headless extension. Pass an editor
 * explicitly, or call it inside a ProseKit Svelte context.
 */
export function useHyperlink(editor) {
    const resolvedEditor = editor ?? get(useEditor());
    const commands = resolvedEditor.commands;
    const state = readable(readViewState(resolvedEditor), set => {
        set(readViewState(resolvedEditor));
        return resolvedEditor.use(defineUpdateHandler(() => set(readViewState(resolvedEditor))));
    });
    return {
        editor: resolvedEditor,
        state,
        openCreate(options = {}) {
            return commands.openLinkPopover({
                ...options,
                mode: 'create',
                trigger: options.trigger ?? 'programmatic',
            });
        },
        openPreview: () => commands.openLinkPopover({ mode: 'preview' }),
        openEdit: () => commands.openLinkPopover({ mode: 'edit' }),
        close: () => commands.closeLinkPopover(),
        apply: input => applyHyperlink(resolvedEditor, commands, input),
        unlink() {
            const ui = getHyperlinkState(resolvedEditor.state);
            if (ui.mode === 'closed' || !selectRange(resolvedEditor, ui.range))
                return false;
            const removed = commands.removeLink();
            if (removed) {
                commands.closeLinkPopover();
                if (resolvedEditor.mounted)
                    resolvedEditor.focus();
            }
            return removed;
        },
        async copy() {
            const href = normalizeHyperlinkHref(resolvedEditor.state, readViewState(resolvedEditor).href, 'copy');
            const clipboard = globalThis.navigator?.clipboard;
            if (!href || !clipboard)
                return false;
            try {
                await clipboard.writeText(href);
                return true;
            }
            catch {
                return false;
            }
        },
        navigate(options = {}) {
            const view = readViewState(resolvedEditor);
            const href = normalizeHyperlinkHref(resolvedEditor.state, view.href, 'navigate');
            if (!href || typeof globalThis.window === 'undefined')
                return false;
            const target = options.target
                ?? (view.mode === 'closed' ? undefined : stringAttr(view.attrs.target))
                ?? '_blank';
            globalThis.window.open(href, target, 'noopener,noreferrer');
            return true;
        },
    };
}
function applyHyperlink(editor, commands, input) {
    const policy = getHyperlinkPolicy(editor.state);
    const ui = getHyperlinkState(editor.state);
    if (!policy || ui.mode === 'closed')
        return { applied: false, decision: REJECTED };
    const decision = policy.normalize(input.href, { source: 'command' });
    if (!decision.ok || !selectRange(editor, ui.range)) {
        return { applied: false, decision: decision.ok ? REJECTED : decision };
    }
    let applied = false;
    if (ui.mode === 'create') {
        const collapsed = ui.range.from === ui.range.to;
        const text = collapsed ? input.text?.trim() || input.href.trim() : undefined;
        applied = commands.addLink({ ...input.attrs, href: decision.href }, text);
    }
    else {
        const update = { href: decision.href };
        if (input.attrs)
            update.attrs = input.attrs;
        if (input.text !== undefined && input.text !== ui.text)
            update.text = input.text;
        applied = commands.updateLink(update);
    }
    if (!applied)
        return { applied: false, decision: REJECTED };
    commands.closeLinkPopover();
    if (editor.mounted)
        editor.focus();
    return { applied: true, decision };
}
function readViewState(editor) {
    const ui = getHyperlinkState(editor.state);
    const active = getActiveLink(editor.state);
    const href = ui.mode === 'closed'
        ? stringAttr(active?.mark.attrs.href) ?? ''
        : stringAttr(ui.attrs.href) ?? '';
    const text = ui.mode === 'closed'
        ? active
            ? editor.state.doc.textBetween(active.from, active.to, ' ', ' ')
            : ''
        : ui.text;
    const range = ui.mode === 'closed' ? active : ui.range;
    const canEditText = Boolean(range && isSimpleTextRange(editor.state.doc, range.from, range.to));
    const canSetText = ui.mode === 'edit'
        ? canEditText
        : ui.mode === 'create' && ui.range.from === ui.range.to;
    return {
        ...ui,
        text,
        active: Boolean(active),
        href,
        canEditText,
        canSetText,
    };
}
function selectRange(editor, range) {
    const { from, to } = range;
    if (from < 0 || to < from || to > editor.state.doc.content.size)
        return false;
    return editor.exec((state, dispatch) => {
        dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
        return true;
    });
}
function stringAttr(value) {
    return typeof value === 'string' && value ? value : undefined;
}
