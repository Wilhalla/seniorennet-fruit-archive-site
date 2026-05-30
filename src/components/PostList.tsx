import type { PostSummary } from '../lib/postIndex'
import PostCard from './PostCard'

type Props = { posts: PostSummary[]; title: string; intro?: string; limit?: number }

export default function PostList({ posts, title, intro, limit }: Props) {
  const visible = limit ? posts.slice(0, limit) : posts
  return (
    <section className="site-shell py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Blogarchief</p>
          <h2 className="section-title">{title}</h2>
          {intro && <p className="section-kicker">{intro}</p>}
        </div>
        {limit && <a className="button-link" href="/archive/">Alle {posts.length.toLocaleString('nl-BE')} berichten</a>}
      </div>
      <div>
        {visible.map((post, index) => <PostCard key={post.id} post={post} featured={index === 0 && !!limit} />)}
      </div>
    </section>
  )
}
