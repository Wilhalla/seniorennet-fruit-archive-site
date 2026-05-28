import { archiveAssetUrl } from '../lib/assetUrls'

type ImageItem = { src: string; title: string; slug: string }
type Props = { images: ImageItem[] }

const tileSpan = ['md:col-span-5 md:min-h-96', 'md:col-span-4 md:min-h-80', 'md:col-span-3', 'md:col-span-3', 'md:col-span-4 md:min-h-80', 'md:col-span-5 md:min-h-96', 'md:col-span-3']

export default function ImageRail({ images }: Props) {
  return (
    <section id="beelden" className="site-shell py-14">
      <div className="mb-8">
        <p className="eyebrow">Uit de fotocollectie</p>
        <h2 className="section-title">Boomgaard, serre, tafel.</h2>
        <p className="section-kicker">Afbeeldingen bij dit bericht.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12 max-sm:flex max-sm:snap-x max-sm:overflow-x-auto max-sm:pb-3">
        {images.map((image, index) => (
          <a className={`relative min-h-60 overflow-hidden rounded-2xl bg-pure-surface text-inherit no-underline shadow-soft max-sm:min-w-4/5 max-sm:snap-start ${tileSpan[index % tileSpan.length]}`} href={`/posts/${image.slug}/`} key={`${image.slug}-${image.src}`}>
            <img className="h-full w-full object-cover transition-transform hover:scale-105" src={archiveAssetUrl(image.src)} alt={image.title} loading="lazy" decoding="async" />
            <span className="absolute inset-x-3 bottom-3 rounded-full bg-pure-surface/90 px-4 py-2 font-medium shadow-soft">{image.title}</span>
          </a>
        ))}
      </div>
    </section>
  )
}
