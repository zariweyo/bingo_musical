# Product definition

## Problem

Preparing a music bingo manually requires choosing songs, creating different cards, distributing them and checking winners. The product should turn a Spotify playlist into a playable private game with minimal preparation.

## MVP user journey

### Host

1. Opens the application.
2. Connects Spotify.
3. Pastes or selects a playlist.
4. Reviews the imported songs.
5. Chooses card size and winning patterns.
6. Creates a private room.
7. Shares a code or QR link.
8. Records the songs that have played.
9. Reviews and validates line or bingo claims.

### Player

1. Opens the invitation link.
2. Enters a display name.
3. Receives a unique card.
4. Marks songs as they play.
5. Claims line or bingo.

## Initial scope

### Included

- Responsive mobile-first interface.
- Spotify sign-in with PKCE.
- Playlist URL and URI parsing.
- Playlist metadata and complete track import.
- Song review and exclusions.
- Deterministic unique card generation.
- Local in-memory or browser-storage game prototype.
- Host and player UI prototypes.
- GitHub Pages deployment.

### Excluded for now

- Firebase authentication, Firestore and Cloud Functions.
- Payments and prizes.
- Audio streaming or playback inside the application.
- Native Android and iOS packages.
- Public game discovery.
- Automatic recognition of the currently playing song.

## Product principles

- A host should understand how to start a game without instructions.
- Players should join without creating an account.
- The card must remain legible on a small phone.
- The app must never imply that it owns or redistributes Spotify audio.
- Failures must be recoverable without losing the selected playlist.

## First milestones

1. Hello-world deployment.
2. Visual home and playlist-import flow using mocks.
3. Spotify developer app and PKCE login.
4. Real playlist import with pagination.
5. Card generator and preview.
6. Local multiplayer simulation.
7. Firebase design and activation.
