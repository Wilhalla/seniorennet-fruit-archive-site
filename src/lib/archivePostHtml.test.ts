import { describe, expect, it } from 'vitest'
import { stripDuplicateTitleFromArchiveHtml } from './archivePostHtml'

describe('stripDuplicateTitleFromArchiveHtml', () => {
  it('removes an exact duplicate leading title paragraph', () => {
    const html = '<p><strong>Lubera Herfstframbozen</strong></p><p>Op de IPM te Essen.</p>'

    expect(stripDuplicateTitleFromArchiveHtml(html, 'Lubera Herfstframbozen'))
      .toBe('<p>Op de IPM te Essen.</p>')
  })

  it('removes duplicate title fragments split over multiple title-like blocks', () => {
    const html = '<p><strong><em>Werken aan een radicaal nieuwe</em></strong></p><p><strong><em>landbouw</em></strong></p><p>Body.</p>'

    expect(stripDuplicateTitleFromArchiveHtml(html, 'Werken aan een radicaal nieuwe landbouw'))
      .toBe('<p>Body.</p>')
  })

  it('preserves useful subtitle text when a title-like block starts with the title', () => {
    const html = '<p><strong>Pikant </strong> Expo te Moorsel (Aalst)</p><p>Met Egenhoven 18/10.</p>'

    expect(stripDuplicateTitleFromArchiveHtml(html, 'Pikant'))
      .toBe('<p>Expo te Moorsel (Aalst)</p><p>Met Egenhoven 18/10.</p>')
  })

  it('preserves subtitle text after a duplicate title split across blocks', () => {
    const html = '<p><strong><em>Werken aan een radicaal nieuwe</em></strong></p><p><strong><em>landbouw</em></strong><em> op het BD/Demeter congres</em></p><p>Body.</p>'

    expect(stripDuplicateTitleFromArchiveHtml(html, 'Werken aan een radicaal nieuwe landbouw'))
      .toBe('<p>op het BD/Demeter congres</p><p>Body.</p>')
  })

  it('does not remove ordinary prose that does not repeat the title', () => {
    const html = '<p>Om u de gelegenheid te geven te delen wat Daniël betekend heeft.</p>'

    expect(stripDuplicateTitleFromArchiveHtml(html, 'Rouwregister Daniël')).toBe(html)
  })

  it('preserves paragraph structure when removing a duplicate title inside a wrapper', () => {
    const html = '<div>\n\n<p>Bath</p>\n\n<p>Op de terugweg.</p>\n\n<p>We zagen de <b>Royal Crescent</b>.</p>\n\n</div>'

    expect(stripDuplicateTitleFromArchiveHtml(html, 'Bath'))
      .toBe('<div>\n\n\n\n<p>Op de terugweg.</p>\n\n<p>We zagen de <b>Royal Crescent</b>.</p>\n\n</div>')
  })

  it('leaves leading image blocks untouched', () => {
    const html = '<p><img src="/archive-images/example.jpg" alt=""></p><p><strong>Title</strong></p>'

    expect(stripDuplicateTitleFromArchiveHtml(html, 'Title')).toBe(html)
  })
})
