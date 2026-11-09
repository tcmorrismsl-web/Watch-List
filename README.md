# Watch List

Track the TV shows and movies you're watching, share a list with someone, and see where each one streams.

**Live site:** https://tcmorrismsl-web.github.io/Watch-List/
**First time?** Follow [SETUP.md](SETUP.md) (about 15 minutes, free).

## Features

- **Watching / Up next / Watched / For you** tabs
- **My list and Our list**: a private list, plus a shared one that syncs live between phones
- **Episode progress**: one tap marks the next episode (`S02E06`) watched; shows "New episodes" and next air dates for shows you follow
- **Ratings**: Loved, Liked, Meh, Not for me
- **Filter by type**: Reality TV, Docuseries, Documentary, Comedy, Drama, Crime and more
- **Filter by where to watch**: Netflix, HBO Max, Hulu, Disney+, Prime Video, Apple TV, Peacock, Paramount+ and others, with real US availability
- **Adding titles**: search, paste a whole list at once, or add by hand
- **For you**: picks based on what you loved and are watching, leaning toward your genres and the services you have, plus what's new on your services

## How it's built

Plain HTML, CSS and JavaScript served as-is by GitHub Pages. The only build step is `build.sh`, which bundles Firebase into `fb.js` and only needs rerunning when Firebase is upgraded.

**Why it opens fast:** the signed-in view is saved on the phone and shown immediately; Firebase loads after the first paint and catches up in the background. `sw.js` caches the app files and fonts so nothing waits on the network, and sign-in starts without Firebase's redirect helper (it loads a hidden page from firebaseapp.com, which is slow on iPhones) unless a Google redirect sign-in is in progress.

| File | What it is |
| --- | --- |
| `index.html` | Page layout and styles |
| `app.js` | All app logic. `APP_VERSION` must match `version.txt` |
| `fb.js` | Firebase, bundled from `src/firebase-entry.js` by `build.sh` |
| `sw.js` | Offline cache: the app opens from the phone, then refreshes in the background |
| `version.txt` | Bump on every release; open apps reload themselves when it changes |
| `config.js` | Your Firebase settings (and optionally a TMDB key) |
| `firestore.rules` | Database security rules to paste into Firebase |
| `manifest.webmanifest`, `icon-*.png` | Home-screen app icon and name |

- **Show data** comes from the [TMDB](https://www.themoviedb.org) API. Streaming availability is provided by JustWatch through TMDB.
- **Sign-in and syncing** use Firebase Authentication and Cloud Firestore.
- Without Firebase set up, the app still works, saving to one browser only.

This product uses the TMDB API but is not endorsed or certified by TMDB.

## Data

Each title is one record:

| Field | Meaning |
| --- | --- |
| `tmdbId`, `title`, `type` (`tv` / `movie`), `year` | Identity |
| `genres` | Categories, such as `Reality TV` or `Docuseries` |
| `platforms` | Where to watch, such as `Netflix` or `HBO Max` |
| `seasons` | Episode count per season, such as `[10, 10, 8]` |
| `status` | `want`, `watching`, `watched` or `dropped` |
| `progress` | Last episode watched, `{ s, e }` |
| `rating` | `2` Loved, `1` Liked, `0` Meh, `-1` Not for me |
| `notes`, `addedBy` | Free text, and who added it to Our list |

Firestore layout: `users/{uid}` (settings), `users/{uid}/items/*` (My list), `households/{code}` (shared list members), `households/{code}/items/*` (Our list).
