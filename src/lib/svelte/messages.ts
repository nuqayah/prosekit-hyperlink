import type {HyperlinkFailureReason} from '../policy.js'

export interface HyperlinkMessages {
  addLink: string
  editLink: string
  linkDetails: string
  url: string
  text: string
  apply: string
  cancel: string
  back: string
  open: string
  copy: string
  copied: string
  unlink: string
  failures: Record<HyperlinkFailureReason, string>
}

export type HyperlinkMessageOverrides = Partial<Omit<HyperlinkMessages, 'failures'>> & {
  failures?: Partial<Record<HyperlinkFailureReason, string>>
}

export const defaultHyperlinkMessages: HyperlinkMessages = {
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
}

export function resolveHyperlinkMessages(
  overrides: HyperlinkMessageOverrides = {},
): HyperlinkMessages {
  return {
    ...defaultHyperlinkMessages,
    ...overrides,
    failures: {
      ...defaultHyperlinkMessages.failures,
      ...overrides.failures,
    },
  }
}
