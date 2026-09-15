import {describe, expect, it} from 'vitest'

import {createHyperlinkPolicy} from '../src/lib/policy.js'
import {
  applicationProtocols,
  communicationProtocols,
  developerProtocols,
  getApplicationLinkInfo,
} from '../src/lib/protocols.js'

describe('application protocol catalogue', () => {
  it('ships an opt-in catalogue large enough for common application links', () => {
    expect(applicationProtocols.length).toBeGreaterThanOrEqual(47)
    expect(new Set(applicationProtocols.map(protocol => protocol.scheme)).size).toBe(
      applicationProtocols.length,
    )
  })

  it('keeps category presets as subsets of the full catalogue', () => {
    const all = new Set(applicationProtocols)
    expect(communicationProtocols.length).toBeGreaterThan(10)
    expect(developerProtocols.length).toBeGreaterThan(4)
    expect(communicationProtocols.every(protocol => all.has(protocol))).toBe(true)
    expect(developerProtocols.every(protocol => all.has(protocol))).toBe(true)
  })

  it('accepts every catalogue scheme only when the catalogue is configured', () => {
    const configured = createHyperlinkPolicy({protocols: applicationProtocols})
    const defaultPolicy = createHyperlinkPolicy()

    for (const protocol of applicationProtocols) {
      const href = `${protocol.scheme}:example`
      expect(configured.normalize(href), href).toMatchObject({
        ok: true,
        href,
        kind: 'protocol',
      })
      expect(defaultPolicy.normalize(href), href).toMatchObject({
        ok: false,
        reason: 'unsupported_scheme',
      })
    }
  })

  it('autolinks configured application schemes', () => {
    const policy = createHyperlinkPolicy({protocols: applicationProtocols})
    expect(
      policy.find('Open whatsapp://send?text=hello or vscode://file/tmp/a.ts'),
    ).toEqual([
      expect.objectContaining({
        text: 'whatsapp://send?text=hello',
        href: 'whatsapp://send?text=hello',
      }),
      expect.objectContaining({
        text: 'vscode://file/tmp/a.ts',
        href: 'vscode://file/tmp/a.ts',
      }),
    ])
  })

  it('classifies schemes and well-known web domains without icons or network work', () => {
    expect(getApplicationLinkInfo('mailto:person@example.com')).toMatchObject({
      type: 'email',
      category: 'communication',
    })
    expect(getApplicationLinkInfo('zoommtg://zoom.us/join?id=1')).toMatchObject({
      type: 'zoom',
      title: 'Zoom Meeting',
    })
    expect(getApplicationLinkInfo('https://api.github.com/repos/a/b')).toMatchObject({
      type: 'github',
      category: 'development',
    })
    expect(getApplicationLinkInfo('wa.me/15551234567')).toMatchObject({
      type: 'whatsapp',
    })
    expect(getApplicationLinkInfo('https://example.com')).toBeNull()
  })
})
