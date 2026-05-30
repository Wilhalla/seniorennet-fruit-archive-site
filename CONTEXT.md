# Seniorennet fruit archive

Static archive site for Daniël Willaeys' fruit blog, preserving posts, images, reactions, and derived browse experiences.

## Language

**Archive post**:
A single imported Seniorennet blog entry with title, body, images, reactions, and original source metadata.
_Avoid_: article record, blog item

**Post series**:
A curated set of archive posts that should read as one entry in aggregated timelines while still keeping every original archive post addressable.
_Avoid_: merged post, combined item

**Archive datetime**:
The normalized date/time facts derived from Seniorennet date strings, including sortable timestamps, archive years, month keys, seasons, chronology groups, and Dutch display labels.
_Avoid_: date helper, time utility

**Archive post reading**:
The resolved reading view for one requested archive post, including whether it displays as a post series, which archive post remains addressable, rendered post parts, image entries, reactions, and related navigation context.
_Avoid_: post details payload, article page props

**Image gallery session**:
The user's current image gallery browsing state: loaded image records, filters, active year, selected image, related images, species/cultivar tags, URL state, and virtual rows.
_Avoid_: gallery UI state, gallery component state

**Species/cultivar tag**:
An evidence-backed label attached to an archive image or archive post, usually a fruit kind, cultivar, plant, animal, or broad visual category.
_Avoid_: AI label, image label

## Example dialogue

Dev: “Should this archive post be shown separately on the home timeline?”
Domain expert: “If it belongs to a post series, show the post series once in the aggregated timeline, but keep the archive post page reachable.”

Dev: “The gallery says this image is from winter but the date is malformed.”
Domain expert: “That belongs to archive datetime. Keep the original string for display fallback, but make the invalid mode explicit.”
