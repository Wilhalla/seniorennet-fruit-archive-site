import { copyFileSync, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import sharp from 'sharp'
import posts from '../src/data/posts.json' with { type: 'json' }

type Post = { images: string[]; html: string; reactions: Array<{ html: string }> }

const projectRoot = resolve('..')
const siteRoot = resolve('.')
const sourceRoot = join(projectRoot, 'mirror/blogimages.seniorennet.be')
const assetRoot = join(siteRoot, 'src/assets/archive-images')
const publicRoot = join(siteRoot, 'public/archive-images')
const thumbRoot = join(siteRoot, 'public/archive-thumbs')
const smallThumbRoot = join(siteRoot, 'public/archive-thumbs-240')
const oldSymlink = join(siteRoot, 'src/assets/blogimages.seniorennet.be')
const imagePattern = /\/archive-images\/(fruit2?|fruit)\/([^"'\s>]+)/g

function collectImagePaths() {
  const images = new Set<string>()
  for (const post of posts as Post[]) {
    for (const image of post.images) images.add(image)
    for (const html of [post.html, ...post.reactions.map((reaction) => reaction.html)]) {
      let match: RegExpExecArray | null
      imagePattern.lastIndex = 0
      while ((match = imagePattern.exec(html))) images.add(`/archive-images/${match[1]}/${match[2]}`)
    }
  }
  return Array.from(images).sort()
}

try {
  if (existsSync(oldSymlink) && statSync(oldSymlink).isSymbolicLink()) unlinkSync(oldSymlink)
} catch {}

let copied = 0
let reused = 0
let missing = 0
let thumbsCreated = 0
let thumbsReused = 0
let thumbsFailed = 0

function copyTo(source: string, target: string) {
  mkdirSync(dirname(target), { recursive: true })
  if (existsSync(target) && statSync(target).size === statSync(source).size) {
    reused += 1
    return
  }
  copyFileSync(source, target)
  copied += 1
}

function thumbnailPath(relative: string) {
  return join(thumbRoot, relative).replace(/\.[^.\/]+$/, '.webp')
}

function smallThumbnailPath(relative: string) {
  return join(smallThumbRoot, relative).replace(/\.[^.\/]+$/, '.webp')
}

async function createThumbnail(source: string, target: string, width: number) {
  mkdirSync(dirname(target), { recursive: true })
  if (existsSync(target)) {
    thumbsReused += 1
    return
  }
  try {
    await sharp(source)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: width <= 240 ? 68 : 72, effort: 4 })
      .toFile(target)
    thumbsCreated += 1
  } catch (error) {
    thumbsFailed += 1
    console.warn(`Thumbnail failed: ${source}`, error)
  }
}

async function runThumbnailJobs(jobs: Array<[source: string, target: string, width: number]>, concurrency = 8) {
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++]
      if (job) await createThumbnail(job[0], job[1], job[2])
    }
  })
  await Promise.all(workers)
}

const thumbnailJobs: Array<[source: string, target: string, width: number]> = []

for (const image of collectImagePaths()) {
  const relative = image.replace('/archive-images/', '')
  const source = join(sourceRoot, relative)
  if (!existsSync(source)) {
    missing += 1
    console.warn(`Missing source image: ${source}`)
    continue
  }
  copyTo(source, join(assetRoot, relative))
  copyTo(source, join(publicRoot, relative))
  thumbnailJobs.push([source, thumbnailPath(relative), 480])
  thumbnailJobs.push([source, smallThumbnailPath(relative), 240])
}

await runThumbnailJobs(thumbnailJobs)

console.log(`Images copied: ${copied}; already present: ${reused}; missing: ${missing}; targets: ${assetRoot}, ${publicRoot}`)
console.log(`Thumbnails created: ${thumbsCreated}; already present: ${thumbsReused}; failed: ${thumbsFailed}; targets: ${thumbRoot}, ${smallThumbRoot}`)
