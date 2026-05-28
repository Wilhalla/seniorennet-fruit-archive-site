import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { globSync } from 'node:fs'
import * as cheerio from 'cheerio'
import { repairTextEncoding } from './text-encoding.ts'
import { parseSeniorennetDateTime } from '../src/lib/archiveDateTime.ts'
import { isSpamReaction } from '../src/lib/reactionSpam.ts'

type BlogKey = 'fruit' | 'fruit2'

type Reaction = {
  id: string
  title: string
  date: string
  isoDate: string
  time: string
  author: string
  html: string
}

type Post = {
  id: string
  blog: BlogKey
  slug: string
  title: string
  date: string
  isoDate: string
  time: string
  author: string
  excerpt: string
  html: string
  images: string[]
  reactionCount: number
  reactions: Reaction[]
  sourcePath: string
}

const root = resolve(dirname(new URL(import.meta.url).pathname), '../..')
const mirrorRoot = join(root, 'mirror')
const siteRoot = join(root, 'site')
const outFile = join(siteRoot, 'src/data/posts.json')
const indexOutFile = join(siteRoot, 'src/data/post-index.json')

const postDateOverrides = new Map<string, { date: string; time: string }>([
  // The mirrored Seniorennet HTML for this post contains the impossible date
  // "30-11--0001" in both the visible date cell and signature, but the original
  // archive context places it on 12-08-2009.
  ['fruit:410227', { date: '12-08-2009', time: '00:00' }],
])

function normalizeSpace(value: string) {
  return repairTextEncoding(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeHtmlSpacing(html: string) {
  // The Seniorennet editor often used long NBSP runs for manual alignment.
  // On the responsive archive these render as huge gaps and prevent normal wrapping.
  return html
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
}

function archiveId(path: string) {
  return path.match(/archief\.php\?ID=(\d+)\.html$/)?.[1] ?? ''
}

function reactionId(path: string) {
  return path.match(/reageer\.php\?postID=(\d+)\.html$/)?.[1] ?? ''
}

function transformImageSrc(raw: string, blog: BlogKey) {
  let src = raw.trim().replace(/&amp;/g, '&')
  if (!src) return ''
  if (/\/Images\/Skin\//i.test(src) || /pixel\.gif|pijl\.gif/i.test(src)) return ''
  if (/^(file|cid|data):/i.test(src)) return ''

  src = src.replace(/^https?:\/\/blogimages\.seniorennet\.be\//i, '/archive-images/')
  src = src.replace(/^https?:\/\/blog\.seniorennet\.be\/blogimages\.seniorennet\.be\//i, '/archive-images/')
  src = src.replace(/^\.\.\/\.\.\/blogimages\.seniorennet\.be\//, '/archive-images/')
  src = src.replace(/^\.\.\/blogimages\.seniorennet\.be\//, '/archive-images/')
  src = src.replace(/^blogimages\.seniorennet\.be\//, '/archive-images/')

  if (!src.startsWith('/') && !/^https?:\/\//i.test(src) && /\.(jpe?g|png|gif|webp)$/i.test(src)) {
    src = `/archive-images/${blog}/${src}`
  }

  if (!src.startsWith('/archive-images/')) return ''
  const relative = src.replace('/archive-images/', '')
  const source = join(mirrorRoot, 'blogimages.seniorennet.be', relative)
  return existsSync(source) ? src : ''
}

function transformHref(raw: string, blog: BlogKey) {
  const href = raw.trim().replace(/&amp;/g, '&')
  if (/\.(jpe?g|png|gif|webp)(?:[?#].*)?$/i.test(href) || /blogimages\.seniorennet\.be/i.test(href)) {
    const imageHref = transformImageSrc(href, blog)
    if (imageHref) return imageHref
    let localHref = href
      .replace(/^https?:\/\/blogimages\.seniorennet\.be\//i, '/archive-images/')
      .replace(/^https?:\/\/blog\.seniorennet\.be\/blogimages\.seniorennet\.be\//i, '/archive-images/')
      .replace(/^\.\.\/\.\.\/blogimages\.seniorennet\.be\//, '/archive-images/')
      .replace(/^\.\.\/blogimages\.seniorennet\.be\//, '/archive-images/')
      .replace(/^blogimages\.seniorennet\.be\//, '/archive-images/')
    if (!localHref.startsWith('/') && !/^https?:\/\//i.test(localHref)) localHref = `/archive-images/${blog}/${localHref}`
    if (localHref.startsWith('/archive-images/')) return localHref
  }
  const archive = href.match(/archief\.php(?:%3F|\?)ID(?:%3D|=)(\d+)/i)?.[1]
  if (archive) return `/posts/${blog}-${archive}/`
  const reaction = href.match(/reageer\.php(?:%3F|\?)postID(?:%3D|=)(\d+)/i)?.[1]
  if (reaction) return `/posts/${blog}-${reaction}/#reactions`
  return href
}

function sanitizeContent(contentCell: cheerio.Cheerio<any>, blog: BlogKey) {
  const $ = cheerio.load(`<main>${contentCell.html() ?? ''}</main>`)
  const main = $('main')

  main.find('script, style, link, meta, object, embed, iframe, form, input, button, textarea, select').remove()
  main.find('h1').each((_, el) => {
    const text = normalizeSpace($(el).text())
    if (/geschreven door/i.test(text) || text === '') $(el).remove()
  })
  main.find('xml, o\\:p, w\\:*').remove()
  main.find('span,font').each((_, el) => {
    $(el).replaceWith($(el).contents())
  })

  main.find('img').each((_, el) => {
    const img = $(el)
    const src = transformImageSrc(img.attr('src') ?? '', blog)
    if (!src) {
      img.remove()
      return
    }
    img.attr('src', src)
    img.attr('loading', 'lazy')
    img.attr('decoding', 'async')
    img.attr('alt', normalizeSpace(img.attr('alt') ?? img.attr('title') ?? ''))
  })

  main.find('a').each((_, el) => {
    const a = $(el)
    const href = a.attr('href')
    if (!href) {
      a.replaceWith(a.contents())
      return
    }
    a.attr('href', transformHref(href, blog))
  })

  main.find('*').each((_, el) => {
    const node = $(el)
    const tag = String((el as any).tagName || '').toLowerCase()
    const attrs = { ...(el as any).attribs }
    for (const key of Object.keys(attrs)) node.removeAttr(key)
    if (tag === 'img') {
      const src = attrs.src ? transformImageSrc(attrs.src, blog) : ''
      if (src) {
        node.attr('src', src)
        node.attr('loading', 'lazy')
        node.attr('decoding', 'async')
        node.attr('alt', normalizeSpace(attrs.alt ?? attrs.title ?? ''))
      }
    }
    if (tag === 'a' && attrs.href) node.attr('href', transformHref(attrs.href, blog))
  })

  main.find('p, div, h2, h3, h4, h5, h6, li').each((_, el) => {
    const node = $(el)
    const hasImage = node.find('img').length > 0
    if (!hasImage && normalizeSpace(node.text()) === '') node.remove()
  })

  const html = normalizeHtmlSpacing(repairTextEncoding((main.html() ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>\s*(<br\s*\/?>\s*){2,}/gi, '<br><br>')
    .replace(/\s+(?=>)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()))
  const images = Array.from(new Set(main.find('img').map((_, img) => $(img).attr('src') || '').get().filter(Boolean)))
  const text = normalizeSpace(main.text())
  return { html, images, text }
}

function normalizeAuthor(author: string) {
  const clean = normalizeSpace(author)
  if (!clean || clean.toLowerCase() === 'daan') return 'Daniel Willaeys'
  return clean
}

function signature(contentCell: cheerio.Cheerio<any>) {
  const sigText = normalizeSpace(contentCell.find('h1').last().text())
  const match = sigText.match(/(\d{2}-\d{2}-\d{4}),\s*(\d{2}:\d{2})\s+geschreven door\s+(.+)/i)
  if (!match) return { date: '', time: '', author: '' }
  return { date: match[1], time: match[2], author: normalizeAuthor(match[3]) }
}

function titleFromCell(titleCell: cheerio.Cheerio<any>) {
  const clone = titleCell.clone()
  clone.find('a, img').remove()
  return normalizeSpace(clone.text()) || 'Naamloos bericht'
}

function parseMainPost($: cheerio.CheerioAPI, file: string, blog: BlogKey, expectedId?: string): Post | undefined {
  const titleCells = $('td.post_titel').toArray()
  const titleEl = titleCells.find((el) => {
    const href = $(el).find('a').first().attr('href') ?? ''
    return href.includes('archief.php') && (!expectedId || href.includes(`ID=${expectedId}`) || href.includes(`ID%3D${expectedId}`))
  }) ?? titleCells.find((el) => ($(el).find('a').first().attr('href') ?? '').includes('archief.php'))

  if (!titleEl) return undefined
  const titleCell = $(titleEl)
  const href = titleCell.find('a').first().attr('href') ?? ''
  const id = expectedId || href.match(/ID(?:%3D|=)(\d+)/)?.[1]
  if (!id) return undefined

  const table = titleCell.closest('table')
  const contentCell = titleCell.parent().nextAll('tr').find('td.bericht_content').first()
  if (!contentCell.length) return undefined

  const sig = signature(contentCell)
  const visibleDate = normalizeSpace(table.find('td.datum').first().text())
  const override = postDateOverrides.get(`${blog}:${id}`)
  const date = override?.date || visibleDate || sig.date
  const time = override?.time || sig.time
  const parsed = sanitizeContent(contentCell, blog)
  const text = normalizeSpace(table.text())
  const reactionCount = Number((text.match(/Reageer\s*\((\d+)\)/i)?.[1]) ?? 0)
  const title = titleFromCell(titleCell)
  const fallbackTitle = parsed.text ? parsed.text.slice(0, 72) : `Bericht ${id}`

  return {
    id,
    blog,
    slug: `${blog}-${id}`,
    title: title === 'Naamloos bericht' ? fallbackTitle : title,
    date,
    isoDate: parseSeniorennetDateTime(date, time),
    time,
    author: sig.author || 'Daniel Willaeys',
    excerpt: parsed.text.slice(0, 240),
    html: parsed.html,
    images: parsed.images,
    reactionCount,
    reactions: [],
    sourcePath: file.replace(root + '/', ''),
  }
}

function parseReactions($: cheerio.CheerioAPI, postId: string, blog: BlogKey): Reaction[] {
  return $('td.post_titel').toArray().flatMap((el, index) => {
    const titleCell = $(el)
    const href = titleCell.find('a').first().attr('href') ?? ''
    if (!href.includes('reageer.php')) return []
    const table = titleCell.closest('table')
    const contentCell = titleCell.parent().nextAll('tr').find('td.bericht_content').first()
    if (!contentCell.length) return []
    const sig = signature(contentCell)
    const visibleDate = normalizeSpace(table.find('td.datum').first().text()) || sig.date
    const parsed = sanitizeContent(contentCell, blog)
    if (!parsed.text && !parsed.html) return []
    return [{
      id: `${postId}-${index}`,
      title: titleFromCell(titleCell),
      date: visibleDate,
      isoDate: parseSeniorennetDateTime(visibleDate, sig.time),
      time: sig.time,
      author: sig.author || 'Onbekend',
      html: parsed.html,
    }]
  })
}

const posts = new Map<string, Post>()

// Archive pages carry the cleanest post metadata (date, time, author) and the
// original article body. They may include neighbouring posts; parse the table
// matching the ID in the filename.
for (const blog of ['fruit', 'fruit2'] as BlogKey[]) {
  const dir = join(mirrorRoot, 'blog.seniorennet.be', blog)
  const archiveFiles = globSync(join(dir, 'archief.php?ID=*.html'))
  for (const file of archiveFiles) {
    const id = archiveId(file)
    if (!id) continue
    const html = readFileSync(file, 'utf8')
    const $ = cheerio.load(html)
    const post = parseMainPost($, file, blog, id)
    if (post) posts.set(post.slug, post)
  }
}

// Reaction pages preserve the comments. Merge those into the archive-derived
// posts. If a reaction page exists for a post missing from archive files, keep
// it as a fallback source rather than dropping it.
for (const blog of ['fruit', 'fruit2'] as BlogKey[]) {
  const dir = join(mirrorRoot, 'blog.seniorennet.be', blog)
  const reactionFiles = globSync(join(dir, 'reageer.php?postID=*.html'))
  for (const file of reactionFiles) {
    const id = reactionId(file)
    if (!id) continue
    const html = readFileSync(file, 'utf8')
    const $ = cheerio.load(html)
    const slug = `${blog}-${id}`
    const existing = posts.get(slug)
    const post = existing ?? parseMainPost($, file, blog, id)
    if (!post) continue
    post.reactions = parseReactions($, id, blog).filter((reaction) => !isSpamReaction(reaction))
    post.reactionCount = post.reactions.length
    posts.set(slug, post)
  }
}

const sorted = Array.from(posts.values()).sort((a, b) => {
  const date = (b.isoDate || '').localeCompare(a.isoDate || '')
  if (date !== 0) return date
  return Number(b.id) - Number(a.id)
})

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(sorted, null, 2))
writeFileSync(indexOutFile, JSON.stringify(sorted.map((post) => ({
  id: post.id,
  blog: post.blog,
  slug: post.slug,
  title: post.title,
  date: post.date,
  isoDate: post.isoDate,
  time: post.time,
  author: post.author,
  excerpt: post.excerpt,
  images: post.images.slice(0, 1),
  imageCount: post.images.length,
  reactionCount: post.reactionCount,
  sourcePath: post.sourcePath,
})), null, 2))

const imageCount = sorted.reduce((sum, post) => sum + post.images.length, 0)
const reactionCount = sorted.reduce((sum, post) => sum + post.reactions.length, 0)
console.log(`Extracted ${sorted.length} posts, ${imageCount} post images, ${reactionCount} reactions`)
