export const defaultHyperlinkMessages = {
    addLink: 'Add link',
    editLink: 'Edit link',
    linkDetails: 'Link details',
    url: 'URL',
    text: 'Text',
    apply: 'Apply',
    cancel: 'Cancel',
    back: 'Back',
    open: 'Open link',
    copy: 'Copy link',
    copied: 'Copied',
    unlink: 'Remove link',
    failures: {
        empty: 'Enter a destination.',
        too_long: 'This destination is too long.',
        unsafe_scheme: 'This destination is not safe.',
        unsupported_scheme: 'This kind of link is not supported.',
        invalid_url: 'Enter a valid URL.',
        invalid_email: 'Enter a valid email address.',
        invalid_phone: 'Enter a valid international phone number.',
        rejected: 'This destination is not allowed.',
    },
};
export function resolveHyperlinkMessages(overrides = {}) {
    return {
        ...defaultHyperlinkMessages,
        ...overrides,
        failures: {
            ...defaultHyperlinkMessages.failures,
            ...overrides.failures,
        },
    };
}
