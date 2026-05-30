export type TopicTaggedArchivePost = {
  topicIds?: readonly string[]
}

export type ArchiveTopicLabel = {
  id: string
  label?: string
  generatedLabel?: string
}

export function activeArchiveTopicFromSearch(search: string) {
  const topic = new URLSearchParams(search).get('topic')?.trim() ?? ''
  return topic
}

export function filterArchivePostsByTopic<T extends TopicTaggedArchivePost>(posts: readonly T[], topicId: string) {
  const activeTopic = topicId.trim()
  if (!activeTopic) return [...posts]
  return posts.filter((post) => post.topicIds?.includes(activeTopic))
}

export function archiveTopicFilterLabel(topic: ArchiveTopicLabel | undefined, fallbackId: string) {
  if (!topic) return fallbackId
  const label = topic.label?.trim()
  if (label && label !== 'Nog te benoemen') return label
  return topic.generatedLabel?.trim() || topic.id || fallbackId
}
