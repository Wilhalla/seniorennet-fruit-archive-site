const cp1252CodePoints: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
}

const unicodeToCp1252Byte = new Map<number, number>(
  Object.entries(cp1252CodePoints).map(([byte, codePoint]) => [codePoint, Number(byte)]),
)

const cp1252MojibakeByte = '[\\u0080-\\u00ff\\u0152\\u0153\\u0160\\u0161\\u0178\\u017d\\u017e\\u0192\\u02c6\\u02dc\\u2013\\u2014\\u2018-\\u201a\\u201c-\\u201e\\u2020-\\u2026\\u2030\\u2039\\u203a\\u20ac\\u2122]'
const mojibakePairPattern = new RegExp(`[ÃÂ]${cp1252MojibakeByte}`, 'g')
const mojibakeTriplePattern = new RegExp(`â${cp1252MojibakeByte}${cp1252MojibakeByte}`, 'g')

function charToOriginalByte(char: string) {
  const code = char.codePointAt(0) ?? 0
  if (code <= 0xff) return code
  return unicodeToCp1252Byte.get(code)
}

function decodeMojibakeUtf8(match: string) {
  const bytes: number[] = []
  for (const char of match) {
    const byte = charToOriginalByte(char)
    if (byte === undefined) return match
    bytes.push(byte)
  }

  const decoded = Buffer.from(bytes).toString('utf8')
  if (decoded.includes('\ufffd')) return match
  return decoded
}

function decodeCp1252Control(char: string) {
  const code = char.codePointAt(0) ?? 0
  const decoded = cp1252CodePoints[code]
  return decoded ? String.fromCodePoint(decoded) : char
}

export function repairTextEncoding(input: string) {
  if (!/[ÃÂâ\u0080-\u009f]/.test(input)) return input

  let value = input

  for (let pass = 0; pass < 4; pass += 1) {
    const previous = value
    value = value
      // Common result of UTF-8 non-breaking spaces in front of HTML entities.
      .replace(/Â(?=&(?:[a-zA-Z]+|#\d+|#x[\da-fA-F]+);)/g, '')
      // UTF-8 bytes decoded as Windows-1252/Latin-1, e.g. Ã©, â€™, â€“.
      .replace(mojibakeTriplePattern, decodeMojibakeUtf8)
      .replace(mojibakePairPattern, decodeMojibakeUtf8)
      // Some spam comments lost the middle bytes of ’s during scraping.
      .replace(/(?<=[A-Za-z])â(?=s\b)/g, '’')
      .replace(/â¦/g, '…')
      .replace(/Ã(?=\s+la\b)/g, 'à')
      .replace(/Â(?=\s|$)/g, '')
      .replace(/â(?=[A-Z])/g, '“')
      .replace(/(?<=[\p{L}\p{N}])â(?=[\s.,;:!?)]|$)/gu, '”')
    if (value === previous) break
  }

  // Remaining C1 control characters are usually Windows-1252 punctuation bytes
  // that were stored as Unicode controls, e.g. FOTO\x92S or Gregg\x92s Pit.
  return value.replace(/[\u0080-\u009f]/g, decodeCp1252Control)
}
