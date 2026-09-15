import {describe, expect, it} from 'vitest'

import {createHyperlinkPolicy} from '../src/lib/policy.js'

const policy = createHyperlinkPolicy()

describe('createHyperlinkPolicy', () => {
  it.each([
    ['example.com', 'https://example.com', 'url'],
    ['www.example.com/a(b)', 'https://www.example.com/a(b)', 'url'],
    ['person@example.com', 'mailto:person@example.com', 'email'],
    ['+1 (202) 555-0100', 'tel:+12025550100', 'phone'],
    ['tel:+962 79 123 4567', 'tel:+962791234567', 'phone'],
    ['/docs/start', '/docs/start', 'relative'],
    ['?page=2', '?page=2', 'relative'],
    ['#intro', '#intro', 'relative'],
    ['http://localhost:3000/a', 'http://localhost:3000/a', 'url'],
    ['https://[::1]/a', 'https://[::1]/a', 'url'],
    ['例子.测试', 'https://例子.测试', 'url'],
    ['mailto:person@example.com?subject=hello', 'mailto:person@example.com?subject=hello', 'email'],
  ] as const)('normalizes %s', (input, href, kind) => {
    expect(policy.normalize(input)).toEqual({ok: true, input, href, kind})
  })

  it.each([
    ['javascript:alert(1)', 'unsafe_scheme'],
    ['java\tscript:alert(1)', 'unsafe_scheme'],
    ['data:text/html,x', 'unsafe_scheme'],
    ['file:///tmp/a', 'unsafe_scheme'],
    ['https://googlecom', 'invalid_url'],
    ['https://user:pass@example.com', 'invalid_url'],
    ['https://a..com', 'invalid_url'],
    ['https://999.999.999.999', 'invalid_url'],
    ['\\\\evil.example', 'invalid_url'],
    ['//example.com', 'invalid_url'],
    ['5551234567', 'invalid_url'],
    ['tel:5551234567', 'invalid_phone'],
    ['+123', 'invalid_url'],
    ['', 'empty'],
  ] as const)('rejects %s', (input, reason) => {
    expect(policy.normalize(input)).toEqual({ok: false, reason})
  })

  it('allows protocol-relative URLs only when explicitly enabled', () => {
    expect(createHyperlinkPolicy({allowProtocolRelative: true}).normalize('//example.com/a')).toEqual({
      ok: true,
      input: '//example.com/a',
      href: '//example.com/a',
      kind: 'url',
    })
  })

  it('supports an explicit HTTP default for bare domains', () => {
    expect(createHyperlinkPolicy({defaultProtocol: 'http'}).normalize('example.com')).toMatchObject({
      ok: true,
      href: 'http://example.com',
    })
  })

  it('can disable relative destinations', () => {
    expect(createHyperlinkPolicy({allowRelative: false}).normalize('/docs')).toEqual({
      ok: false,
      reason: 'invalid_url',
    })
  })

  it('applies custom validation after the safety floor', () => {
    const httpsOnly = createHyperlinkPolicy({
      validate: decision => decision.href.startsWith('https://'),
    })
    expect(httpsOnly.normalize('example.com').ok).toBe(true)
    expect(httpsOnly.normalize('http://example.com')).toEqual({ok: false, reason: 'rejected'})
    expect(httpsOnly.normalize('javascript:alert(1)')).toEqual({
      ok: false,
      reason: 'unsafe_scheme',
    })
  })

  it('keeps custom protocol configuration instance-local', () => {
    const withVscode = createHyperlinkPolicy({protocols: [{scheme: 'vscode'}]})
    const withoutVscode = createHyperlinkPolicy()

    expect(withVscode.normalize('vscode://file/tmp/a')).toEqual({
      ok: true,
      input: 'vscode://file/tmp/a',
      href: 'vscode://file/tmp/a',
      kind: 'protocol',
    })
    expect(withoutVscode.normalize('vscode://file/tmp/a')).toEqual({
      ok: false,
      reason: 'unsupported_scheme',
    })
  })

  it('can allow a custom protocol explicitly without autolinking it', () => {
    const custom = createHyperlinkPolicy({protocols: [{scheme: 'vscode', autolink: false}]})
    expect(custom.normalize('vscode://file/tmp/a').ok).toBe(true)
    expect(custom.find('Open vscode://file/tmp/a')).toEqual([])
  })

  it('honors protocol validators and normalizers', () => {
    const custom = createHyperlinkPolicy({
      protocols: [
        {
          scheme: 'issue',
          validate: /^issue:\d+$/,
          normalize: href => href.toUpperCase(),
        },
      ],
    })

    expect(custom.normalize('issue:42')).toMatchObject({ok: true, href: 'ISSUE:42'})
    expect(custom.normalize('issue:nope')).toEqual({ok: false, reason: 'rejected'})
  })

  it('rechecks custom protocol normalizer output', () => {
    const custom = createHyperlinkPolicy({
      protocols: [{scheme: 'safe', normalize: () => 'javascript:alert(1)'}],
    })
    expect(custom.normalize('safe:value')).toEqual({ok: false, reason: 'rejected'})
  })

  it('detects URLs, email, and phone with source ranges', () => {
    const text = 'See example.com, mail person@example.com or call +962 79 123 4567.'
    expect(policy.find(text)).toEqual([
      {
        ok: true,
        input: 'example.com',
        href: 'https://example.com',
        kind: 'url',
        from: 4,
        to: 15,
        text: 'example.com',
      },
      {
        ok: true,
        input: 'person@example.com',
        href: 'mailto:person@example.com',
        kind: 'email',
        from: 22,
        to: 40,
        text: 'person@example.com',
      },
      {
        ok: true,
        input: '+962 79 123 4567',
        href: 'tel:+962791234567',
        kind: 'phone',
        from: 49,
        to: 65,
        text: '+962 79 123 4567',
      },
    ])
  })

  it('trims terminal punctuation while retaining balanced parentheses', () => {
    expect(policy.find('Read https://en.wikipedia.org/wiki/Specials_(Unicode_block).')).toMatchObject([
      {
        text: 'https://en.wikipedia.org/wiki/Specials_(Unicode_block)',
        href: 'https://en.wikipedia.org/wiki/Specials_(Unicode_block)',
      },
    ])
  })

  it('lets shouldAutoLink veto detection without blocking explicit writes', () => {
    const manualOnly = createHyperlinkPolicy({shouldAutoLink: () => false})
    expect(manualOnly.find('example.com')).toEqual([])
    expect(manualOnly.normalize('example.com').ok).toBe(true)
  })

  it('respects detection options', () => {
    const urlsOnly = createHyperlinkPolicy({detect: {emails: false, phones: false}})
    expect(urlsOnly.find('example.com person@example.com +962791234567').map(match => match.kind)).toEqual([
      'url',
    ])
  })

  it('rejects oversized input', () => {
    expect(createHyperlinkPolicy({maxLength: 8}).normalize('example.com')).toEqual({
      ok: false,
      reason: 'too_long',
    })
  })
})
