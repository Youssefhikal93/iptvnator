# One finish rule for progress

## Context

Playback used a 30-second margin while the library used 95 %. A saved movie
or episode could therefore offer Resume while another screen counted it watched.

## Decision

Progress owns ids, records, resume thresholds and the existing localStorage
store. With a known positive duration, an item is watched when its position
reaches 95 % or fewer than 30 seconds remain. Reading and saving use this rule.
Playback ending or marking watched saves a full record; unknown lengths use
the existing positive full-record sentinel. Unknown duration alone is never watched.

## Consequences

Old records near the end now count as watched consistently, including 93 % of
a five-minute video. New watched progress stays at 100 %. Continue watching,
ticks, next episode selection and Resume share the decision. Keys and record
shapes are unchanged; reads do not migrate or rewrite stored data.
