# Product definition

## Problem

Preparing a music bingo manually requires choosing songs, creating different cards, distributing them and checking winners. The product should turn a Spotify playlist into a playable private game with minimal preparation.

## MVP user journey

### Host

1. Opens the application.
2. Connects Spotify.
3. Pastes or selects a playlist.
4. Reviews the imported songs.
5. Creates or reuses a private room number.
6. Shares that number so participants can join once.
7. Presses `Iniciar bingo` to generate a new host card and begin a round.
8. Uses the fullscreen landscape game view to record the songs that have played.
9. Invites more participants with the same room number when needed.
10. Reviews and validates line or bingo claims.
11. Ends the current round and returns to preparation without changing the room number.
12. Can start another round and distribute new cards while existing participants remain associated with the same room.

### Player

1. Opens the invitation link or join screen.
2. Enters the host room number and a display name.
3. Receives a unique card.
4. Marks songs as they play.
5. Claims line or bingo.
6. Can receive a new card for a later round without entering the room number again.

## Current implemented prototype

- Spotify sign-in uses Authorization Code with PKCE.
- Logging out clears the local application session, and a new connection forces Spotify to show its authorization dialog so another account can be selected.
- The host selects one of their own Spotify playlists.
- The preparation screen shows a four-digit room number before the card is generated.
- The room number is stored in browser storage and remains stable for that host across rounds and Spotify disconnections.
- The host can explicitly regenerate the room number from the preparation screen.
- Selecting a playlist no longer starts the game automatically.
- `Iniciar bingo` generates a random 15-song host card and opens the game view.
- The game view is optimized for landscape orientation.
- In portrait orientation, a dismissible notice recommends rotating the phone; it is informational and does not block play.
- The game header is intentionally minimal and only exposes `Terminar partida`, the room number and `Invitar participantes`.
- `Invitar participantes` displays the persistent room number and explains that real joining is still simulated.
- `Terminar partida` asks for confirmation and returns to preparation while preserving the room number and selected playlist.
- Starting another bingo generates a new host card for a new round without requiring participants to enter a new room number.
- Real room membership, player cards, QR links and multiplayer synchronization are still mocked and will be connected later.

## Room and round model

- A **room** belongs to the host and is identified by a stable four-digit number.
- A **round** is one bingo session and can generate a new set of cards.
- Ending a round does not end or replace the room.
- Regenerating the room number is an explicit host action available only before a round starts.
- The stable room model allows the host to distribute new cards without forcing participants to join again.

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
- Participants should not need to re-enter a room number for each new round.
- The card must remain legible on a small phone and should use landscape orientation during play.
- Portrait orientation must remain usable and should show guidance rather than blocking the user.
- During a game, the card should occupy the screen and non-game controls should be kept to a minimum.
- The app must never imply that it owns or redistributes Spotify audio.
- Failures must be recoverable without losing the selected playlist or stable room number.

## First milestones

1. Hello-world deployment.
2. Visual home and playlist-import flow using mocks.
3. Spotify developer app and PKCE login.
4. Real playlist import with pagination.
5. Persistent local host room and fullscreen host card.
6. Local participant joining and multi-round card simulation.
7. Firebase design and activation.
