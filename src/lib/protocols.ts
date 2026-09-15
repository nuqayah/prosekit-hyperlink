import type {HyperlinkProtocol} from './policy.js'

const APPLICATION_PROTOCOL_ENTRIES = [
  ['telprompt', 'phone', 'Phone', 'communication'],
  ['sms', 'sms', 'SMS', 'communication'],
  ['facetime', 'facetime', 'FaceTime', 'communication'],
  ['facetime-audio', 'facetime-audio', 'FaceTime Audio', 'communication'],
  ['whatsapp', 'whatsapp', 'WhatsApp', 'social'],
  ['tg', 'telegram', 'Telegram', 'social'],
  ['discord', 'discord', 'Discord', 'social'],
  ['skype', 'skype', 'Skype', 'social'],
  ['slack', 'slack', 'Slack', 'social'],
  ['twitter', 'twitter', 'Twitter', 'social'],
  ['fb', 'facebook', 'Facebook', 'social'],
  ['instagram', 'instagram', 'Instagram', 'social'],
  ['linkedin', 'linkedin', 'LinkedIn', 'social'],
  ['snapchat', 'snapchat', 'Snapchat', 'social'],
  ['reddit', 'reddit', 'Reddit', 'social'],
  ['tiktok', 'tiktok', 'TikTok', 'social'],
  ['zoommtg', 'zoom', 'Zoom Meeting', 'communication'],
  ['zoomus', 'zoom', 'Zoom', 'communication'],
  ['msteams', 'teams', 'Microsoft Teams', 'communication'],
  ['webex', 'webex', 'Cisco Webex', 'communication'],
  ['calshow', 'calendar', 'Calendar', 'apple'],
  ['x-apple-calevent', 'calendar', 'Calendar Event', 'apple'],
  ['x-apple-reminder', 'reminders', 'Reminders', 'apple'],
  ['contacts', 'contacts', 'Contacts', 'apple'],
  ['maps', 'maps', 'Maps', 'apple'],
  ['map', 'maps', 'Maps', 'apple'],
  ['music', 'music', 'Apple Music', 'apple'],
  ['videos', 'apple-tv', 'Apple TV', 'apple'],
  ['mobilenotes', 'notes', 'Notes', 'apple'],
  ['photos-redirect', 'photos', 'Photos', 'apple'],
  ['shortcuts', 'shortcuts', 'Shortcuts', 'apple'],
  ['itms-apps', 'app-store', 'App Store', 'apple'],
  ['github', 'github', 'GitHub', 'development'],
  ['gitlab', 'gitlab', 'GitLab', 'development'],
  ['vscode', 'vscode', 'VS Code', 'development'],
  ['vscode-insiders', 'vscode', 'VS Code Insiders', 'development'],
  ['jetbrains', 'jetbrains', 'JetBrains', 'development'],
  ['notion', 'notion', 'Notion', 'productivity'],
  ['obsidian', 'obsidian', 'Obsidian', 'productivity'],
  ['figma', 'figma', 'Figma', 'development'],
  ['youtube', 'youtube', 'YouTube', 'entertainment'],
  ['spotify', 'spotify', 'Spotify', 'entertainment'],
  ['netflix', 'netflix', 'Netflix', 'entertainment'],
  ['twitch', 'twitch', 'Twitch', 'entertainment'],
  ['amazon', 'amazon', 'Amazon', 'shopping'],
  ['uber', 'uber', 'Uber', 'other'],
  ['lyft', 'lyft', 'Lyft', 'other'],
] as const

const DOMAIN_ENTRIES = [
  ['wa.me', 'whatsapp', 'WhatsApp', 'social'],
  ['t.me', 'telegram', 'Telegram', 'social'],
  ['discord.gg', 'discord', 'Discord Invite', 'social'],
  ['zoom.us', 'zoom', 'Zoom Meeting', 'communication'],
  ['meet.google.com', 'meet', 'Google Meet', 'communication'],
  ['teams.microsoft.com', 'teams', 'Microsoft Teams', 'communication'],
  ['github.com', 'github', 'GitHub', 'development'],
  ['gitlab.com', 'gitlab', 'GitLab', 'development'],
  ['figma.com', 'figma', 'Figma', 'development'],
  ['notion.so', 'notion', 'Notion', 'productivity'],
  ['twitter.com', 'twitter', 'Twitter', 'social'],
  ['x.com', 'twitter', 'X', 'social'],
  ['instagram.com', 'instagram', 'Instagram', 'social'],
  ['linkedin.com', 'linkedin', 'LinkedIn', 'social'],
  ['youtube.com', 'youtube', 'YouTube', 'entertainment'],
  ['spotify.com', 'spotify', 'Spotify', 'entertainment'],
] as const

export type ApplicationLinkType =
  | (typeof APPLICATION_PROTOCOL_ENTRIES)[number][1]
  | (typeof DOMAIN_ENTRIES)[number][1]
  | 'email'

export type ApplicationLinkCategory =
  | (typeof APPLICATION_PROTOCOL_ENTRIES)[number][3]
  | (typeof DOMAIN_ENTRIES)[number][3]

export interface ApplicationLinkInfo {
  type: ApplicationLinkType
  title: string
  category: ApplicationLinkCategory
}

export interface ApplicationProtocol extends HyperlinkProtocol, ApplicationLinkInfo {
  scheme: string
}

export const applicationProtocols: readonly ApplicationProtocol[] =
  APPLICATION_PROTOCOL_ENTRIES.map(([scheme, type, title, category]) => ({
    scheme,
    type,
    title,
    category,
  }))

export const communicationProtocols = applicationProtocols.filter(
  protocol => protocol.category === 'communication' || protocol.category === 'social',
)

export const developerProtocols = applicationProtocols.filter(
  protocol => protocol.category === 'development',
)

const schemeInfo = new Map<string, ApplicationLinkInfo>([
  ['mailto', {type: 'email', title: 'Email', category: 'communication'}],
  ['tel', {type: 'phone', title: 'Phone', category: 'communication'}],
  ...applicationProtocols.map(
    ({scheme, type, title, category}) => [scheme, {type, title, category}] as const,
  ),
])

const domainInfo = DOMAIN_ENTRIES.map(
  ([domain, type, title, category]) => [domain, {type, title, category}] as const,
)

/** Classify a configured app scheme or a well-known web domain. */
export function getApplicationLinkInfo(href: string): ApplicationLinkInfo | null {
  const value = href.trim()
  if (!value) return null

  const scheme = /^([a-z][a-z\d+.-]*):/iu.exec(value)?.[1]?.toLowerCase()
  if (scheme) {
    const info = schemeInfo.get(scheme)
    if (info) return info
  }

  try {
    const url = new URL(scheme ? value : `https://${value}`)
    const hostname = url.hostname.toLowerCase().replace(/^www\./u, '')
    for (const [domain, info] of domainInfo) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return info
    }
  } catch {
    // A malformed or non-web destination has no domain classification.
  }
  return null
}
