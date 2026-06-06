import { describe, it, expect } from 'vitest'
import {
  parseRobotsForUserAgent,
  isAllowedByRobots,
} from '../scrapers/lib/fetch-helpers'

describe('parseRobotsForUserAgent', () => {
  it('retourne null quand aucun bloc UA pertinent', () => {
    const text = `
User-agent: GoogleBot
Disallow: /private/
`
    expect(parseRobotsForUserAgent(text, 'encre-bot')).toBeNull()
  })

  it('matche le bloc spécifique au bot avant le wildcard', () => {
    const text = `
User-agent: *
Disallow: /everything/

User-agent: encre-bot
Disallow: /just-this/
`
    const r = parseRobotsForUserAgent(text, 'encre-bot')
    expect(r).not.toBeNull()
    expect(r!.rules).toEqual([{ allow: false, pathPrefix: '/just-this/' }])
  })

  it('retombe sur wildcard si pas de bloc spécifique', () => {
    const text = `
User-agent: *
Disallow: /admin/
Disallow: /private
Allow: /private/public-section/
`
    const r = parseRobotsForUserAgent(text, 'encre-bot')!
    expect(r.rules).toHaveLength(3)
    expect(r.rules[0]).toEqual({ allow: false, pathPrefix: '/admin/' })
    expect(r.rules[2]).toEqual({ allow: true, pathPrefix: '/private/public-section/' })
  })

  it('parse Crawl-delay en ms', () => {
    const text = `
User-agent: *
Crawl-delay: 5
Disallow: /admin/
`
    const r = parseRobotsForUserAgent(text, 'encre-bot')!
    expect(r.crawlDelayMs).toBe(5000)
  })

  it('Crawl-delay fractionnaire toléré', () => {
    const text = `
User-agent: *
Crawl-delay: 2.5
`
    const r = parseRobotsForUserAgent(text, 'encre-bot')!
    expect(r.crawlDelayMs).toBe(2500)
  })

  it("Disallow vide = pas de restriction (convention robots)", () => {
    const text = `
User-agent: *
Disallow:
`
    const r = parseRobotsForUserAgent(text, 'encre-bot')
    // Le bloc existe mais aucune règle effective
    expect(r?.rules).toEqual([])
  })

  it('ignore les commentaires et lignes vides', () => {
    const text = `
# robots.txt — exemple
User-agent: *  # all bots
# pas dans /admin
Disallow: /admin/

# pas dans /tmp non plus
Disallow: /tmp/
`
    const r = parseRobotsForUserAgent(text, 'encre-bot')!
    expect(r.rules).toHaveLength(2)
  })

  it('case-insensitive sur user-agent', () => {
    const text = `
User-Agent: ENCRE-BOT
Disallow: /x/
`
    expect(parseRobotsForUserAgent(text, 'encre-bot')).not.toBeNull()
  })
})

describe('isAllowedByRobots', () => {
  it('autorise par défaut si aucune règle ne matche', () => {
    const rules = parseRobotsForUserAgent(
      `User-agent: *\nDisallow: /admin/`,
      'encre-bot',
    )!
    expect(isAllowedByRobots(rules, '/articles/123')).toBe(true)
  })

  it('bloque les chemins matchant Disallow', () => {
    const rules = parseRobotsForUserAgent(
      `User-agent: *\nDisallow: /admin/`,
      'encre-bot',
    )!
    expect(isAllowedByRobots(rules, '/admin/users')).toBe(false)
    expect(isAllowedByRobots(rules, '/admin/')).toBe(false)
  })

  it('Allow plus spécifique l\'emporte sur Disallow', () => {
    const rules = parseRobotsForUserAgent(
      `User-agent: *
Disallow: /private
Allow: /private/public/`,
      'encre-bot',
    )!
    expect(isAllowedByRobots(rules, '/private/secret')).toBe(false)
    expect(isAllowedByRobots(rules, '/private/public/post')).toBe(true)
  })

  it('Allow l\'emporte à longueur égale', () => {
    const rules = parseRobotsForUserAgent(
      `User-agent: *
Disallow: /x
Allow: /x`,
      'encre-bot',
    )!
    expect(isAllowedByRobots(rules, '/x/anything')).toBe(true)
  })

  it('aucune règle (rules = []) = tout autorisé', () => {
    expect(isAllowedByRobots({ rules: [], crawlDelayMs: 0 }, '/any/path')).toBe(true)
  })
})
