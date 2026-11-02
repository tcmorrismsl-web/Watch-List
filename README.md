# Watch List

A personal tracker for TV shows and movies: what you're watching, what's up next, and what you've finished, with recommendations based on your taste.

## Features

- **Watching / Up next / Watched / For you** tabs
- **Episode progress** for shows: one tap marks the next episode (`S02E06`) watched, with a progress bar and season-finished / caught-up notices
- **Ratings**: Loved, Liked, Meh, Not for me
- **Category filter**: Reality TV, Docuseries, Documentary, Comedy, Drama, Crime and more
- **Where to watch**: each title lists its streaming services (Netflix, HBO Max, Hulu, Disney+, Prime Video, Apple TV, Peacock, Paramount+ and others), with a filter for each service
- **Adding titles**: search, paste a whole list at once, or add by hand
- **Picks**: recommendations from your library, ratings, favorite genres, the services you have and your current mood

## How it runs

The app is a single file, `index.html`, with no build step.

It is built to run as a Claude artifact, where it uses:

- **Claude** to look up titles, seasons, categories and streaming services, and to make recommendations
- **Per-user storage** so your list follows your Claude account across devices

Opened anywhere else (for example GitHub Pages or a local file), it still works as a tracker, but titles are added by hand and the list is saved only in that browser.

## Data model

Each title is stored as one record:

| Field | Meaning |
| --- | --- |
| `title`, `type` (`tv` / `movie`), `year`, `endYear` | Basic info |
| `genres` | Categories, e.g. `Reality TV`, `Docuseries` |
| `platforms` | Where to watch, e.g. `Netflix`, `HBO Max` |
| `seasons` | Episode count per season, e.g. `[10, 10, 8]` |
| `status` | `want`, `watching`, `watched` or `dropped` |
| `progress` | Last episode watched, `{ s, e }` |
| `rating` | `2` Loved, `1` Liked, `0` Meh, `-1` Not for me |
| `notes` | Free text |

Streaming availability comes from Claude's knowledge and can lag recent changes. Use **Refresh details** on a title, or edit its services by hand.
