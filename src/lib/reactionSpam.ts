export type ReactionSpamInput = {
  title: string
  author: string
  html: string
  date?: string
}

const SPAM_KEYWORD_PATTERNS = [
  /\b(?:nike|adidas|yeezy|jordan|air\s*force|air\s*max|pandora|moncler|louboutin|jerseys?|wholesale|outlet|cheap\s+(?:shoes|jerseys|jordans)|kors|coach\s+(?:outlet|factory)|oakley|ralph\s+lauren|canada\s+goose|ray\s*ban|hermes\s+belts?)\b/i,
  /\b(?:casino|slot\s*online|joker123|judi|poker\d*|idn\s*poker|ceme\s+online|togel|data\s+(?:hk|sgp|sdy)|agen\s+poker)\b/i,
  /\b(?:escorts?|sexshop|cenforce|online\s+pharmacy|canada\s+drugs|credit\s+verifier|private\s+credit|kredietverstrekker)\b/i,
  /\b(?:phone\s+number|customer\s+(?:service|support|care)|contact\s+(?:number|help|support|center)|tech\s+support|printer\s+support|mobile\s+number\s+tracker|person\s+finder|identified\s+call|cellebrite)\b/i,
  /\b(?:digital\s+india|aadhar|aadhaar|scholarships?\s+gov|shala\s+darpan|typing\s+speed|online\s+typing|csc\s+login|rsa\s+full\s+form|a2z\s+full\s+form|pmay\s+scheme)\b/i,
  /\b(?:seo\s+service|best\s+retro\s+jerseys|retro\s+football\s+shirts|maillot\s+de\s+foot|quick\s*ship|auto\s+shipping|car\s+shipping|shipping\s+company\s+for\s+cars|frp\s+tanks?|molded\s+grating|cozy\s+home\s+dubai|coffee\s+table\s+dubai|dining\s+table\s+dubai)\b/i,
  /\b(?:essay\s+writing|office\.(?:com\/)?setup|office\s+installation|floor\s+plan\s+download|condos?|root\s+genius|getapk|\bapk\b|zombie\s+tsunami|tomb\s+raider|fmovies|gomovies|sockshare|hotstar|colors\s*tv|vijay\s*tv|bepanah|card\s+games\s+for\s+kids|gay\s+apps?|dating\s+apps?|longman\s+grammar|\bmsrt\b|learn\s+english|\binversion\b|brain\s+foods?)\b/i,
  /\b(?:cleaners?|pest\s+control|packers\s+plus\s+movers|building\s+inspection|interior\s+design\s+edmonton|dentist\s+red\s+deer|dental\s+implants?|telephone\s+pliable|smartphone\s+flexible|tourism\s+and\s+travel\s+business|lithuania\s+legal|belgis(?:ch|kt)\s+k(?:ö|o)rkort|documents?\s+online|photographer\s+dubai|ariston\s+servisi|payday\s+loans?|cash\s+advance|short\s+term\s+loan|loan\s+calculators?|dong\s*phuc)\b/i,
]

const SPAM_AUTHOR_PATTERNS = [
  /^(?:karin|charlibilson|xiaoou|jianbin\d*|\d{8}caihuali|kanidfdf|leinf1pi|hansara\d*|bepanah_pyaar|fcicomposites|quick\s*ship\s*cars|best\s*retro\s*jerseys|gaia1956|techpro|top\s*tablets|ah?toto|jonebanes|fdfdsfsf)$/i,
]

const GENERIC_PRAISE_PATTERNS = [
  /\b(?:nice|good|great|thanks|thank you|keep it up|wonderful article|interesting article|informative article|useful information|thanks for sharing|i appreciate|first visit to your blog|good blog|read good stuff|never seen such blogs|complete things with all details)\b/i,
]

const PROMOTIONAL_PATTERNS = [
  /\b(?:click here|visit\b[^.]{0,50}\b(?:website|blog|page)|check (?:my )?(?:link|website)|read more|buy .* online|shop the best|free delivery|call us|keywords?:|download (?:the )?latest|watch free|go to my page)\b/i,
]

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function externalHrefCount(html: string) {
  return Array.from(html.matchAll(/href=["']([^"']+)["']/gi))
    .map((match) => match[1])
    .filter((href) => /^https?:\/\//i.test(href))
    .filter((href) => !/^https?:\/\/(?:blog\.)?seniorennet\.(?:be|nl)\b/i.test(href))
    .length
}

function bareDomainCount(value: string) {
  return (value.match(/\b[a-z0-9-]+\.(?:com|net|org|info|biz|us|co|uk|ir|in|ca|ae)\b/gi) ?? [])
    .filter((domain) => !/seniorennet\.(?:be|nl)$/i.test(domain))
    .length
}

function linkCount(html: string, text: string) {
  return externalHrefCount(html) + bareDomainCount(text)
}

function looksLikeMojibake(value: string) {
  const suspicious = value.match(/[ìíîïðØÙÛÚ¤£½¼]/g)?.length ?? 0
  return suspicious >= 4
}

function isShortLinkDrop(text: string) {
  const withoutUrls = text.replace(/https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|net|org|info|biz|us|co|uk|ir|in|ca|ae|edu)\b/gi, '').replace(/[^a-zA-ZÀ-ÿ0-9]+/g, '')
  return withoutUrls.length < 24
}

function isGenericOnly(title: string, text: string) {
  const combined = `${title} ${text}`.trim()
  if (!combined) return false
  if (!GENERIC_PRAISE_PATTERNS.some((pattern) => pattern.test(combined))) return false
  return combined.replace(/\b(?:nice|good|great|thanks|thank|you|keep|it|up|post|blog|article|man|hi|hello|really|very|so|much|for|sharing|the|this|is|my|first|visit|to|your)\b/gi, '').replace(/[^a-zA-ZÀ-ÿ0-9]+/g, '').length < 18
}

export function isSpamReaction(reaction: ReactionSpamInput) {
  const text = stripTags(reaction.html)
  const combined = `${reaction.title} ${reaction.author} ${text}`
  const links = linkCount(reaction.html, combined)

  if (looksLikeMojibake(combined)) return true
  if (SPAM_AUTHOR_PATTERNS.some((pattern) => pattern.test(reaction.author.trim()))) return true
  if (SPAM_KEYWORD_PATTERNS.some((pattern) => pattern.test(combined))) return true

  if (links >= 3) return true
  if (links > 0 && PROMOTIONAL_PATTERNS.some((pattern) => pattern.test(combined))) return true
  if (links > 0 && GENERIC_PRAISE_PATTERNS.some((pattern) => pattern.test(combined))) return true
  if (links > 0 && /^\s*(?:https?:\/\/|www\.)/i.test(reaction.title)) return true
  if (links > 0 && isShortLinkDrop(`${reaction.title} ${text}`)) return true
  if (links > 0 && reaction.title.trim().length <= 4 && reaction.author.trim().length <= 8) return true

  const year = reaction.date?.match(/\b(20\d{2})\b/)?.[1]
  if (year && Number(year) >= 2021 && isGenericOnly(reaction.title, text)) return true

  return false
}
