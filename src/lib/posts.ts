import postsData from '../data/posts.json'
import { formatArchiveDate } from './date'

export type Reaction = {
  id: string
  title: string
  date: string
  isoDate: string
  time: string
  author: string
  html: string
}

export type Post = {
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

export const posts = postsData as Post[]

export const stats = {
  postCount: posts.length,
  imageCount: posts.reduce((sum, post) => sum + post.images.length, 0),
  reactionCount: posts.reduce((sum, post) => sum + post.reactions.length, 0),
  yearCount: new Set(posts.map((post) => post.isoDate.slice(0, 4)).filter(Boolean)).size,
}

export const formatDate = formatArchiveDate

export function getPost(slug: string) {
  return posts.find((post) => post.slug === slug)
}

export function postsWithImages(limit: number) {
  return posts.filter((post) => post.images.length > 0).slice(0, limit)
}

export function featuredImages(limit: number) {
  const seen = new Set<string>()
  const images: Array<{ src: string; title: string; slug: string }> = []
  for (const post of posts) {
    for (const src of post.images) {
      if (seen.has(src)) continue
      seen.add(src)
      images.push({ src, title: post.title, slug: post.slug })
      if (images.length >= limit) return images
    }
  }
  return images
}
