import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import posts from '../src/data/posts.json' with { type: 'json' }

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
  blog: 'fruit' | 'fruit2'
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

const outDir = resolve('src/content/blog-posts')
const indexWidth = String((posts as Post[]).length).length

function titleSlug(title: string) {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/g, '')
  return slug || 'naamloos-bericht'
}

function fileName(post: Post, index: number) {
  const prefix = String(index + 1).padStart(indexWidth, '0')
  return `${prefix}-${post.blog}-${titleSlug(post.title)}.md`
}

function scalar(value: string | number | boolean) {
  return JSON.stringify(value)
}

function stringList(name: string, values: string[]) {
  if (values.length === 0) return `${name}: []`
  return `${name}:\n${values.map((value) => `  - ${scalar(value)}`).join('\n')}`
}

function reactionMeta(reactions: Reaction[]) {
  if (reactions.length === 0) return 'reactions: []'
  return `reactions:\n${reactions.map((reaction) => [
    `  - id: ${scalar(reaction.id)}`,
    `    title: ${scalar(reaction.title)}`,
    `    date: ${scalar(reaction.date)}`,
    `    isoDate: ${scalar(reaction.isoDate)}`,
    `    time: ${scalar(reaction.time)}`,
    `    author: ${scalar(reaction.author)}`,
  ].join('\n')).join('\n')}`
}

function frontmatter(post: Post) {
  return [
    '---',
    `id: ${scalar(post.id)}`,
    `blog: ${scalar(post.blog)}`,
    `slug: ${scalar(post.slug)}`,
    `title: ${scalar(post.title)}`,
    `date: ${scalar(post.date)}`,
    `isoDate: ${scalar(post.isoDate)}`,
    `time: ${scalar(post.time)}`,
    `author: ${scalar(post.author)}`,
    `excerpt: ${scalar(post.excerpt)}`,
    `reactionCount: ${post.reactionCount}`,
    `sourcePath: ${scalar(post.sourcePath)}`,
    stringList('images', post.images),
    reactionMeta(post.reactions),
    '---',
  ].join('\n')
}

function body(post: Post) {
  const reactions = post.reactions.length === 0
    ? ''
    : `\n\n<section class="materialized-reactions">\n<h2>Reacties</h2>\n${post.reactions.map((reaction) => `\n<article id="reaction-${reaction.id}">\n<header>\n<p>${reaction.date}${reaction.time ? ` · ${reaction.time}` : ''} · ${reaction.author}</p>\n<h3>${reaction.title}</h3>\n</header>\n${reaction.html}\n</article>`).join('\n')}\n</section>`

  return `<article class="materialized-post" data-blog="${post.blog}" data-id="${post.id}">\n${post.html}\n</article>${reactions}\n`
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

for (const [index, post] of (posts as Post[]).entries()) {
  writeFileSync(join(outDir, fileName(post, index)), `${frontmatter(post)}\n\n${body(post)}`)
}

console.log(`Wrote ${(posts as Post[]).length} per-post Markdown files to ${outDir}`)
