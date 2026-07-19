# AGENTS.md

## Product

Bingo Musical is a mobile-first web application. A host imports a Spotify playlist, creates a private game and shares access with players. Each player receives a song card and marks songs as they are played.

## Current phase

Focus only on:

1. Ionic + Angular foundations.
2. Mobile-first UI and navigation.
3. Spotify authentication using Authorization Code with PKCE.
4. Importing playlist metadata and tracks.
5. Local mock state for games and cards.
6. GitHub Pages compatibility.

Do not activate Firebase yet. Firebase-related code may exist only as clearly marked comments or documentation. Do not add Firebase packages until requested.

## Technical rules

- Use Angular standalone components.
- Use strict TypeScript; avoid `any`.
- Use Ionic components when they improve mobile behavior or accessibility.
- Keep components small and feature-oriented.
- Put external API access behind services.
- Never commit secrets, access tokens or Spotify client secrets.
- Browser authorization must use PKCE.
- Keep the app compatible with the GitHub Pages base path `/bingo_musical/`.
- Use English for identifiers, filenames and code comments.
- Use Spanish for the current user-facing UI.
- Prefer immutable models and pure helper functions.
- Add tests for URL parsing, card generation and scoring rules when implemented.
- Make all implementation changes on the `develop` branch unless explicitly instructed otherwise.
- Always update the relevant project documentation in the same change so it accurately describes the behavior that was actually implemented.
- A feature or fix is not complete when its implementation and documentation disagree.

## Proposed structure

```text
src/app/
  core/
    auth/
    spotify/
  features/
    home/
    playlist-import/
    game-host/
    game-player/
  shared/
    models/
    components/
    utilities/
```

Create folders only when they contain real code; do not generate empty architecture.

## Spotify constraints

- Extract playlist IDs from both Spotify URLs and Spotify URIs.
- Handle pagination for playlists longer than one API page.
- Preserve Spotify attribution and links with Spotify metadata.
- Do not download, proxy or store audio.
- Display clear states for authentication, loading, empty playlists, expired sessions, forbidden playlists and rate limiting.

## Quality gate

Before finishing a change:

```bash
npm install
npm run build
```

A change is incomplete if the production build fails.
