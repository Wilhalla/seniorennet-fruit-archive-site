import { describe, expect, it } from 'vitest'
import { isSpamReaction } from './reactionSpam'

describe('isSpamReaction', () => {
  it('filters link-farm product spam', () => {
    expect(isSpamReaction({
      title: 'Moncler Jacket',
      author: 'Lisa',
      date: '19-12-2022',
      html: '<a href="https://example.com">Nike Cortez Men</a> <a href="https://example.org">Jordan 12</a>',
    })).toBe(true)
  })

  it('filters generic praise wrapped around promotional links', () => {
    expect(isSpamReaction({
      title: 'Good',
      author: 'Frank',
      date: '21-02-2024',
      html: '<p><a href="https://quickshipcars.com/services/expedited-auto-shipping/">QuickShip’s fastest car shipping</a> is a service that offers fast shipping for vehicles.</p>',
    })).toBe(true)
  })

  it('filters mojibake spam', () => {
    expect(isSpamReaction({
      title: 'í°ì½ì£¼ì',
      author: 'fdfdsfsf',
      date: '05-10-2023',
      html: 'ëë ¤ì£¼ê³ ë¹ì ì´ ëë¥¼ ëìë ë¤ë¥¸ ì¬ëë¤ì',
    })).toBe(true)
  })

  it('keeps archive-relevant comments without promotional links', () => {
    expect(isSpamReaction({
      title: 'Enthout?',
      author: 'Karl',
      date: '02-01-2019',
      html: 'Dag Daniel, is er enthout te bekomen van deze, nog onbekende, Dawi? Ik zou hem graag in mijn tuin zetten',
    })).toBe(false)
  })

  it('keeps Seniorennet signature links used by real commenters', () => {
    expect(isSpamReaction({
      title: "Prachtige foto's van de meesjes beste Daan,fijn weekend",
      author: 'Lenie',
      date: '01-02-2019',
      html: '<a href="http://blog.seniorennet.be/muziek_muziek/"></a>',
    })).toBe(false)
  })
})
