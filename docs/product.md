# Product definition

## Problem

Preparing a music bingo manually requires choosing songs, creating different cards, distributing them and checking winners. The product should turn a Spotify playlist into a playable private game with minimal preparation.

## MVP user journey

### Host

1. Opens the application.
2. Receives an anonymous Firebase identity automatically in the background.
3. Connects Spotify.
4. Pastes or selects a playlist.
5. Reviews the imported songs.
6. Creates or reuses a private room number.
7. Shares that number so participants can join once.
8. Presses `Iniciar bingo` to generate a new host card and begin a round.
9. Uses the fullscreen landscape game view to record the songs that have played.
10. Invites more participants with the same room number when needed.
11. Reviews and validates line or bingo claims.
12. Ends the current round and returns to preparation without changing the room number.
13. Can start another round and distribute new cards while existing participants remain associated with the same room.

### Player

1. Opens the invitation link or join screen.
2. Receives an anonymous Firebase identity automatically in the background.
3. Enters the host room number and a display name.
4. Receives a unique card.
5. Marks songs as they play.
6. Claims line or bingo.
7. Can receive a new card for a later round without entering the room number again.

## Current implemented prototype

- Spotify sign-in uses Authorization Code with PKCE.
- Logging out clears the local application session, and a new connection forces Spotify to show its authorization dialog so another account can be selected.
- Firebase Authentication is initialized during Angular bootstrap.
- Every browser signs in anonymously in the background before the application finishes starting.
- Anonymous authentication uses local persistence, so Firebase normally reuses the same `uid` across reloads and future visits from the same browser profile.
- The current Firebase user and `uid` are exposed through `AnonymousAuthService` under `src/app/core/firebase/`.
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
- Firebase and Cloud Firestore are initialized in the Angular application through AngularFire.
- Firebase access is centralized behind authentication and Firestore services; current room and round state has not yet been migrated from browser storage.
- A production-oriented `firestore.rules` file is stored in the repository, together with its expected data model and deployment guide in `docs/firestore.md`.
- Real room membership, player cards, QR links and multiplayer synchronization are still mocked and will be connected to Firestore in later changes.

## Firebase Authentication and Firestore

- Firebase project: `simple-estatico`.
- The browser application uses the public Firebase web configuration stored in `src/environments/firebase.config.ts`.
- Firebase Authentication, anonymous sign-in and Cloud Firestore are registered during Angular bootstrap.
- Anonymous authentication is invisible to the user and does not require registration, email or password.
- The Firebase `uid` is the stable authorization identity for both hosts and participants.
- The `uid` is not the public room number and must not be used as an invitation code.
- Clearing browser site data, using private browsing or changing browser profiles can create a new anonymous user and therefore a new `uid`.
- Application code should access Firebase through services under `src/app/core/firebase/`, not directly from UI components.
- Firestore security rules are currently in test mode and allow writes. This is temporary for development only.
- `firestore.rules` contains the intended production authorization model and should replace test-mode rules after the documented Firestore paths have been implemented and tested.
- The expected production collections are `rooms`, room-scoped `participants`, `rounds` and participant-owned `cards`.
- Complete deployment instructions, data fields, access rules, limitations and a production checklist are maintained in `docs/firestore.md`.
- No Firebase service-account credentials, admin SDK keys or other private secrets may be committed to the repository.

## Room and round model

- A **room** belongs to the host Firebase `uid` and is identified publicly by a stable four-digit number.
- A **round** is one bingo session and can generate a new set of cards.
- Ending a round does not end or replace the room.
- Regenerating the room number is an explicit host action available only before a round starts.
- The stable room model allows the host to distribute new cards without forcing participants to join again.

## Initial scope

### Included

- Responsive mobile-first interface.
- Spotify sign-in with PKCE.
- Anonymous Firebase Authentication in the background.
- Persistent browser-level Firebase user identity.
- Playlist URL and URI parsing.
- Playlist metadata and complete track import.
- Song review and exclusions.
- Deterministic unique card generation.
- Local in-memory or browser-storage game prototype.
- Firebase and Cloud Firestore application foundation.
- Versioned production-oriented Firestore rules and deployment documentation.
- Host and player UI prototypes.
- GitHub Pages deployment.

### Excluded for now

- Linking or upgrading anonymous users to permanent accounts.
- Deployment of production Firestore security rules.
- Persisted multiplayer room synchronization.
- Cloud Functions and trusted backend rate limiting.
- Payments and prizes.
- Audio streaming or playback inside the application.
- Native Android and iOS packages.
- Public game discovery.
- Automatic recognition of the currently playing song.

## Product principles

- A host should understand how to start a game without instructions.
- Players should join without creating an account.
- Authentication should happen invisibly unless it fails.
- Participants should not need to re-enter a room number for each new round.
- The card must remain legible on a small phone and should use landscape orientation during play.
- Portrait orientation must remain usable and should show guidance rather than blocking the user.
- During a game, the card should occupy the screen and non-game controls should be kept to a minimum.
- The app must never imply that it owns or redistributes Spotify audio.
- Failures must be recoverable without losing the selected playlist or stable room number.
- Public client configuration may be committed, but private credentials and unrestricted production data access are forbidden.
- Firestore access must be denied by default and granted only to authenticated hosts or participants with the minimum required permissions.

## First milestones

1. Hello-world deployment.
2. Visual home and playlist-import flow using mocks.
3. Spotify developer app and PKCE login.
4. Real playlist import with pagination.
5. Persistent local host room and fullscreen host card.
6. Firebase, anonymous Authentication and Firestore application foundation.
7. Persisted rooms, participants and multi-round cards.
8. Firestore Emulator security tests and production rules deployment.
