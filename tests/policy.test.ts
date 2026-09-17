import {describe, expect, it} from 'vitest'

import {createHyperlinkPolicy} from '../src/lib/policy.js'

const policy = createHyperlinkPolicy()

describe('createHyperlinkPolicy', () => {
  it.each([
    ['example.com', 'https://example.com', 'url'],
    ['www.example.com/a(b)', 'https://www.example.com/a(b)', 'url'],
    ['person@example.com', 'mailto:person@example.com', 'email'],
    ['person+tag@example.com', 'mailto:person+tag@example.com', 'email'],
    ['+1 (202) 555-0100', 'tel:+12025550100', 'phone'],
    ['tel:+962 79 123 4567', 'tel:+962791234567', 'phone'],
    ['/docs/start', '/docs/start', 'relative'],
    ['?page=2', '?page=2', 'relative'],
    ['#intro', '#intro', 'relative'],
    ['http://localhost:3000/a', 'http://localhost:3000/a', 'url'],
    ['https://[::1]/a', 'https://[::1]/a', 'url'],
    ['例子.测试', 'https://例子.测试', 'url'],
    ['ᆑ.com', 'https://ᆑ.com', 'url'],
    ['ﹽ.com', 'https://ﹽ.com', 'url'],
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
    ['https://example.com..', 'invalid_url'],
    ['https:example.com', 'invalid_url'],
    ['https:/example.com', 'invalid_url'],
    ['https:///example.com', 'invalid_url'],
    ['https://%65xample.com', 'invalid_url'],
    ['http://2130706433', 'invalid_url'],
    ['http://0x7f000001', 'invalid_url'],
    ['http://0177.0.0.1', 'invalid_url'],
    ['https://999.999.999.999', 'invalid_url'],
    ['https://example.123', 'invalid_url'],
    ['https://Sy2Qj.6', 'invalid_url'],
    ['https://a.0', 'invalid_url'],
    ['https://☃.com', 'invalid_url'],
    ['https://😀.com', 'invalid_url'],
    ['https://١.com', 'invalid_url'],
    ['\\\\evil.example', 'invalid_url'],
    ['//example.com', 'invalid_url'],
    ['5551234567', 'invalid_url'],
    ['tel:5551234567', 'invalid_phone'],
    ['mailto:a,b@example.com', 'invalid_email'],
    ['mailto:a"b@example.com', 'invalid_email'],
    ['mailto:ü@example.com', 'invalid_email'],
    ['\u001chttps://example.com', 'invalid_url'],
    ['\u0085https://example.com', 'invalid_url'],
    ['+123', 'invalid_url'],
    ['', 'empty'],
  ] as const)('rejects %s', (input, reason) => {
    expect(policy.normalize(input)).toEqual({ok: false, reason})
  })

  it('rejects email over the UTF-16 length limit', () => {
    const domain = Array.from({length: 4}, () => '𐐀'.repeat(35)).join('.')
    expect(policy.normalize(`mailto:a@${domain}`)).toEqual({ok: false, reason: 'invalid_email'})
  })

  it('trims a boundary BOM like browser string trimming', () => {
    expect(policy.normalize('\ufeffhttps://example.com')).toEqual({
      ok: true,
      input: 'https://example.com',
      href: 'https://example.com',
      kind: 'url',
    })
  })

  it('rejects a hostname longer than the DNS limit', () => {
    const hostname = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`
    expect(policy.normalize(`https://${hostname}`)).toEqual({ok: false, reason: 'invalid_url'})
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

  it('measures maximum length in UTF-16 code units', () => {
    const prefix = 'https://example.com/'
    expect(policy.normalize(`${prefix}${'😀'.repeat(1_014)}`).ok).toBe(true)
    expect(policy.normalize(`${prefix}${'😀'.repeat(1_015)}`)).toEqual({
      ok: false,
      reason: 'too_long',
    })
  })

  it('rejects oversized input', () => {
    expect(createHyperlinkPolicy({maxLength: 8}).normalize('example.com')).toEqual({
      ok: false,
      reason: 'too_long',
    })
  })
})
