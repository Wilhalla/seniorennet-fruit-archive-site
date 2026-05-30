import { Images, Search } from "lucide-react";
import { archiveAssetUrl } from "../lib/assetUrls";
import { archiveDayLabel, archiveTimestamp, archiveYear, buildArchiveChronology, displayArchiveYear, formatArchiveDate } from "../lib/archiveDateTime";
import type { PostSummary } from "../lib/postIndex";

type Props = { posts: PostSummary[]; limit?: number };
const countPill =
  "inline-flex min-h-6 items-center rounded-full px-2.5 font-mono text-[11px] leading-none";

export default function ChronologicalFeed({ posts, limit }: Props) {
  const { chronologicalItems: chronologicalPosts, yearGroups, monthGroups } = buildArchiveChronology(
    posts,
    { limit },
  );
  const validPosts = chronologicalPosts.filter((post) =>
    Number.isFinite(archiveTimestamp(post)),
  );
  const firstPost = validPosts[0] ?? chronologicalPosts[0];
  const firstYear = firstPost ? archiveYear(firstPost) : "";
  const displayTime = (post: PostSummary) =>
    post.time && post.time !== "00:00" ? post.time : "";

  return (
    <section className="w-full pb-24" aria-labelledby="chronology-title">
      <div className="relative w-full overflow-hidden border-b border-chalk bg-eggshell px-8 py-20 max-md:px-4 max-md:text-center md:py-32">
        <img
          className="apple-image absolute right-[7vw] top-8 hidden w-28 rotate-6 opacity-90 md:block"
          src="/apple-assets/apple-1-192.png"
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
        />
        <div className="mx-auto grid max-w-page items-end justify-items-center gap-10 md:grid-cols-[minmax(0,0.62fr)_minmax(18rem,0.38fr)] md:justify-items-stretch">
          <div className="max-md:grid max-md:justify-items-center">
            <h1
              id="chronology-title"
              className="display-title max-w-3xl max-md:mx-auto"
            >
              Blogarchief Daniël Willaeys
            </h1>
          </div>
          <div className="max-w-md justify-self-center md:justify-self-end md:pb-2">
            <img
              className="apple-image section-apple mx-auto mb-5 md:hidden"
              src="/apple-assets/apple-1-192.png"
              alt=""
              aria-hidden="true"
              loading="eager"
              decoding="async"
            />
            <div className="mt-6 flex flex-wrap justify-center gap-2 md:justify-start">
              <a
                className="inline-flex min-h-9 items-center gap-2 rounded-full bg-obsidian px-4 text-body font-medium text-eggshell no-underline shadow-blue hover:text-eggshell"
                href="/search/"
              >
                <Search className="size-4" aria-hidden="true" strokeWidth={2.2} />
                Zoeken
              </a>
              <a
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-chalk bg-pure-surface px-3 text-body font-medium text-obsidian no-underline shadow-blue hover:text-obsidian"
                href="/gallery/"
              >
                <Images className="size-4" aria-hidden="true" strokeWidth={2.2} />
                Beeldarchief
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="site-shell relative z-10 overflow-x-clip py-16">
        <div className="grid min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-4 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8">
          <aside className="sticky top-16 self-start pr-2 md:top-16 md:pr-6" aria-label="Tijdlijnnavigatie">
            <div className="max-h-[calc(100svh-4rem)] overflow-auto border-r border-chalk/80 py-2 pr-2 md:max-h-[calc(100vh-5rem)] md:py-5 md:pr-6">
              <p className="m-0 border-b border-chalk pb-3 text-body text-gravel max-md:sr-only">Jaren</p>
              <nav
                className="grid gap-1 md:gap-0.5"
                aria-label="Spring naar jaar"
              >
                {yearGroups.map((group) => (
                  <a
                    className={
                      group.year === firstYear
                        ? "flex min-h-8 w-full items-center justify-center gap-3 whitespace-nowrap rounded-full bg-obsidian px-2 text-center text-sm font-medium text-eggshell no-underline hover:text-eggshell md:justify-between md:px-3 md:text-left md:text-base"
                        : "flex min-h-8 w-full items-center justify-center gap-3 whitespace-nowrap rounded-full px-2 text-center text-sm text-slate-ink no-underline hover:bg-powder hover:text-obsidian md:justify-between md:px-3 md:text-left md:text-base"
                    }
                    key={group.year}
                    aria-label={`Spring naar ${displayArchiveYear(group.year)}, ${group.count} berichten`}
                    href={`#year-${group.year}`}
                  >
                    <span>{displayArchiveYear(group.year)}</span>
                    <span className="hidden shrink-0 font-mono text-xs md:inline">
                      {group.count}
                    </span>
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <div
            className="grid min-w-0 gap-10 md:pl-2"
            aria-label="Chronologische berichtenindex"
          >
            {monthGroups.map((month) => (
              <section
                className="grid min-w-0 gap-3 md:grid-cols-[3.5rem_minmax(0,1fr)]"
                id={month.key}
                data-year={month.year}
                aria-label={month.label}
                key={month.key}
              >
                {month.startsYear && (
                  <span
                    id={`year-${month.year}`}
                    className="scroll-mt-24"
                    aria-hidden="true"
                  ></span>
                )}
                {month.startsYear && (
                  <header className="col-span-full mb-4 flex items-end justify-between border-b border-rule pb-3">
                    <p className="m-0 text-sm text-slate-ink">
                      {yearGroups
                        .find((group) => group.year === month.year)
                        ?.count.toLocaleString("nl-BE")}{" "}
                      berichten
                    </p>
                    <h2 className="m-0 font-heading text-5xl font-normal leading-none tracking-tight text-midnight-navy md:text-7xl">
                      {displayArchiveYear(month.year)}
                    </h2>
                  </header>
                )}
                <div className="pt-3 max-md:hidden" aria-hidden="true">
                  <span className="sticky top-24 block pt-3 text-sm font-medium lowercase text-gravel">
                    {month.shortLabel}
                  </span>
                </div>
                <div className="grid min-w-0">
                  <div className="border-t border-chalk py-3 md:hidden">
                    <p className="m-0 text-xs font-medium uppercase tracking-[0.16em] text-gravel">
                      {month.label}
                    </p>
                  </div>
                  {month.items.map((post, index) => {
                    const image = post.images[0];
                    const dateId = post.isoDate?.slice(0, 10) || "";
                    const timeLabel = displayTime(post);
                    return (
                      <article
                        className={`group min-w-0 py-6 transition-colors ${month.startsYear && index === 0 ? "" : "border-t border-chalk hover:border-slate/70"}`}
                        key={post.id}
                      >
                        <a
                          className={
                            image
                              ? "grid min-w-0 gap-4 text-inherit no-underline md:grid-cols-[13rem_minmax(0,1fr)] md:items-center md:gap-8"
                              : "grid min-w-0 gap-4 text-inherit no-underline md:grid-cols-[2.75rem_minmax(0,1fr)] md:gap-4"
                          }
                          href={`/posts/${post.slug}/`}
                          aria-label={`Lees ${post.title}`}
                        >
                          <div className={image ? "grid gap-3 self-start" : "self-start"}>
                            <time
                              className={
                                image
                                  ? "flex items-baseline gap-2 text-gravel md:block md:text-left"
                                  : "flex items-baseline gap-2 text-gravel"
                              }
                              dateTime={dateId}
                              aria-label={formatArchiveDate(post)}
                            >
                              <span className="text-sm font-medium leading-none text-obsidian">
                                {archiveDayLabel(post)}
                              </span>
                              <span className="text-xs uppercase tracking-[0.14em] text-slate-ink md:hidden">
                                {month.shortLabel}
                              </span>
                            </time>
                            {image && (
                              <div
                                className="relative aspect-[4/3] overflow-hidden rounded-[2px] bg-powder"
                                aria-hidden="true"
                              >
                                <img
                                  className="h-full w-full object-cover saturate-[0.82] transition duration-200 group-hover:scale-[1.01] group-hover:saturate-100"
                                  src={archiveAssetUrl(image)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 self-center">
                            <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs leading-none tracking-tight text-slate-ink">
                              {timeLabel && <span title={formatArchiveDate(post)}>{timeLabel}</span>}
                              <span
                                className="inline-flex flex-wrap gap-1.5"
                                aria-label={`${post.imageCount} beelden, ${post.reactionCount} reacties${post.seriesPostCount ? `, samengevoegde reeks van ${post.seriesPostCount} berichten` : ""}`}
                              >
                                {post.seriesPostCount && (
                                  <span
                                    className={`${countPill} bg-obsidian text-eggshell`}
                                    title={`Samengevoegde reeks: ${post.seriesPostCount} berichten`}
                                  >
                                    {post.seriesPostCount} delen
                                  </span>
                                )}
                                <span className={`${countPill} bg-powder text-gravel`} title="Beelden">
                                  {post.imageCount} beelden
                                </span>
                                <span className={`${countPill} bg-powder text-gravel`} title="Reacties">
                                  {post.reactionCount} reacties
                                </span>
                              </span>
                            </div>
                            <h4 className="m-0 max-w-4xl break-words text-[22px] font-medium leading-[1.16] tracking-[-0.035em] text-obsidian [overflow-wrap:anywhere] md:text-[30px]">
                              {post.title}
                            </h4>
                            {post.excerpt && (
                              <p className="mt-3 max-w-3xl break-words text-[15px] leading-7 text-gravel [overflow-wrap:anywhere]">
                                {post.excerpt}
                              </p>
                            )}
                          </div>
                        </a>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
