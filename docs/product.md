# Product definition

## Problem

Preparing a music bingo manually requires choosing songs, creating different cards, distributing them and checking winners. The product should turn a Spotify playlist into a playable private game with minimal preparation.

## MVP user journey

### Entry

1. Opens the application.
2. Receives an anonymous Firebase identity automatically in the background.
3. Chooses between `Ser anfitrión` and `Unirme a una partida`.

### Host

1. Chooses to be the host.
2. The application reserves a random six-digit room number in Firestore.
3. Connects Spotify.
4. Selects one of their playlists.
5. Shares the room number with participants.
6. Presses `Iniciar bingo` to generate a new host card and begin a round.
7. Uses the fullscreen landscape game view to record the songs that have played.
8. Ends the current round and can start another while the room remains valid.

### Participant

1. Chooses to join a game.
2. Enters the host's six-digit room number; no Spotify connection or display name is required.
3. The application verifies that the room exists, is open and has not expired.
4. A participant record is created using the anonymous Firebase `uid`.
5. Waits for the host to begin the round.
6. In the next multiplayer milestone, receives and plays a synchronized card.

## Current implemented prototype

- Spotify sign-in uses Authorization Code with PKCE.
- Spotify access tokens are renewed automatically before expiry by using the PKCE refresh token.
- Spotify API requests retry once after a `401` with a freshly renewed access token instead of immediately disconnecting the host.
- The refresh token is preserved when Spotify rotates only the access token and does not return a replacement refresh token.
- Logging out clears the access token, refresh token and local Spotify application session.
- Firebase Authentication is initialized during Angular bootstrap.
- Every browser signs in anonymously before the application finishes starting.
- Anonymous authentication uses local persistence, so Firebase normally reuses the same `uid` across reloads.
- The landing screen offers explicit host and participant roles.
- Host rooms are real Firestore documents with random six-digit codes.
- A room expires two hours after creation.
- Code reservation uses a Firestore transaction to avoid concurrent collisions.
- An active colliding code is rejected and another code is generated.
- An expired colliding code is claimed in `resetting` state, its old participants, rounds and cards are deleted, and it is reopened for the new host.
- Participants join using only the room number.
- A missing, closed or expired room produces `La partida no existe o ya ha caducado.`
- Host and participant roles, together with the room code, survive reloads when the room remains valid.
- The host role and room code survive the Spotify authorization redirect.
- The host selects one of their own Spotify playlists.
- Selecting a playlist does not start the game automatically.
- `Iniciar bingo` generates a random 15-song host card and opens the game view.
- The game view is optimized for landscape orientation.
- `Terminar partida` returns to preparation while preserving the room and selected playlist.
- Starting another bingo generates a new host card for a new round.
- Firebase and Cloud Firestore are initialized through AngularFire.
- Room lifecycle logic is centralized in `RoomSessionService` under `src/app/core/firebase/`.
- The complete room model, collision handling and cleanup behavior are documented in `docs/rooms.md`.
- Participant card distribution, round synchronization and claims are not implemented yet.

## Spotify token lifecycle

- The short-lived access token is stored in `sessionStorage` with a one-minute safety margin.
- The refresh token is stored in `localStorage` so the connection can recover after expiry or a tab restart.
- Before every Spotify request, the application verifies the access token and renews it when necessary.
- Concurrent requests share one refresh operation.
- If Spotify returns `401`, the request is retried once after forcing a refresh.
- The Spotify session is cleared only when renewal fails or the retried request is rejected.

## Firebase Authentication and Firestore

- Firebase project: `simple-estatico`.
- The browser uses the public Firebase web configuration in `src/environments/firebase.config.ts`.
- Firebase Authentication, anonymous sign-in and Cloud Firestore are registered during Angular bootstrap.
- The Firebase `uid` is the authorization identity for both hosts and participants.
- The `uid` is not the public room number.
- Clearing browser site data, using private browsing or changing browser profiles can create a new anonymous user.
- Application code accesses Firebase through services under `src/app/core/firebase/`.
- `firestore.rules` contains the intended authorization model and two-hour room validity checks.
- Production rules must be deployed before relying on this model outside test mode.
- No service-account credentials, admin SDK keys or private secrets may be committed.

## Room and round model

- A **room** belongs to the host Firebase `uid` and is identified publicly by a six-digit number.
- A room is valid for two hours from creation.
- A **round** is one bingo session and can generate a new set of cards.
- Ending a round does not end the room.
- Closing the host session marks the room as closed.
- Regenerating the room number closes the previous room and reserves another one.
- Participants do not need to re-enter the number after a reload while the room is valid.

## Initial scope

### Included

- Responsive mobile-first interface.
- Spotify sign-in with PKCE and automatic access-token renewal.
- Anonymous Firebase Authentication.
- Explicit host and participant entry flows.
- Six-digit Firestore room reservation with collision handling.
- Two-hour room expiry and expired-room cleanup.
- Participant membership records.
- Playlist metadata and complete track import.
- Local host card generation and play state.
- Versioned Firestore rules and deployment documentation.
- GitHub Pages deployment.

### Excluded for now

- Linking anonymous users to permanent accounts.
- Automatic deployment of Firestore security rules.
- Synchronized participant card distribution and round state.
- Line and bingo claim validation across devices.
- Cloud Functions and trusted backend rate limiting.
- Payments and prizes.
- Audio streaming or playback inside the application.
- Native Android and iOS packages.
- Public game discovery.
- Automatic recognition of the currently playing song.

## Product principles

- A host should understand how to start a game without instructions.
- Participants should join without creating an account or connecting Spotify.
- Authentication should happen invisibly unless it fails.
- The room number alone should be enough to join.
- Participants should not need to re-enter a room number for each round.
- The card must remain legible on a small phone and should use landscape orientation during play.
