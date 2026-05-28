import * as cheerio from 'cheerio'

function normalizeToken(token: string) {
  return token
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function tokens(value: string) {
  return Array.from(value.matchAll(/[\p{L}\p{N}]+/gu), (match) => normalizeToken(match[0]))
}

function normalizedText(value: string) {
  return tokens(value).join(' ')
}

function isSameOrTokenPrefix(prefix: string, full: string) {
  return prefix !== '' && (prefix === full || full.startsWith(`${prefix} `))
}

function joinNormalized(left: string, right: string) {
  if (!left) return right
  if (!right) return left
  return `${left} ${right}`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function firstElementChild($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>) {
  for (const child of root.contents().toArray()) {
    if (child.type === 'text' && $(child).text().trim() === '') continue
    if (child.type === 'tag') return $(child)
    return undefined
  }
  return undefined
}

function blockText(block: cheerio.Cheerio<any>) {
  const clone = block.clone()
  clone.find('br').replaceWith(' ')
  return clone.text().replace(/\s+/g, ' ').trim()
}

function isTitleLikeBlock(block: cheerio.Cheerio<any>) {
  const tag = String(block.prop('tagName') ?? '').toLowerCase()
  return /^h[1-6]$/.test(tag) || block.find('strong,b,em').length > 0
}

function isSupportedLeadingBlock(block: cheerio.Cheerio<any>) {
  const tag = String(block.prop('tagName') ?? '').toLowerCase()
  return tag === 'p' || tag === 'div' || /^h[1-6]$/.test(tag)
}

function textWithoutTokenPrefix(text: string, prefixTokens: string[]) {
  const textMatches = Array.from(text.matchAll(/[\p{L}\p{N}]+/gu))
  if (prefixTokens.length === 0 || textMatches.length < prefixTokens.length) return undefined

  for (let index = 0; index < prefixTokens.length; index += 1) {
    if (normalizeToken(textMatches[index][0]) !== prefixTokens[index]) return undefined
  }

  const end = (textMatches[prefixTokens.length - 1].index ?? 0) + textMatches[prefixTokens.length - 1][0].length
  return text.slice(end).replace(/^[\s:;,.\-–—]+/, '').trim()
}

/**
 * Seniorennet post bodies often repeat the visible archive title as the first
 * bold paragraph. The archive page already renders that title as the page/part
 * heading, so remove only leading title-like blocks while leaving real body
 * prose intact.
 */
export function stripDuplicateTitleFromArchiveHtml(html: string, title: string) {
  const titleTokens = tokens(title)
  const titleNorm = titleTokens.join(' ')
  if (!html || !titleNorm) return html

  const $ = cheerio.load(`<main>${html}</main>`)
  const main = $('main')
  let consumedTitlePrefix = ''

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const first = firstElementChild($, main)
    if (!first || !isSupportedLeadingBlock(first) || first.find('img').length > 0) break

    const text = blockText(first)
    const blockNorm = normalizedText(text)
    if (!blockNorm) break

    const candidatePrefix = joinNormalized(consumedTitlePrefix, blockNorm)
    const titleLike = isTitleLikeBlock(first)

    if (blockNorm === titleNorm || (titleLike && isSameOrTokenPrefix(candidatePrefix, titleNorm))) {
      first.remove()
      consumedTitlePrefix = candidatePrefix
      continue
    }

    if (titleLike && isSameOrTokenPrefix(titleNorm, candidatePrefix)) {
      const consumedTokenCount = consumedTitlePrefix ? consumedTitlePrefix.split(' ').length : 0
      const remainder = textWithoutTokenPrefix(text, titleTokens.slice(consumedTokenCount))
      if (remainder) first.html(escapeHtml(remainder))
      else first.remove()
    }
    break
  }

  return main.html() ?? html
}
