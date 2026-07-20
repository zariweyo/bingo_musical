# Rooms, participants and rounds

## Identity and rooms
Firebase anonymous authentication provides the browser identity. The display name is stored in `users/{uid}` and copied to `rooms/{roomCode}/participants/{uid}`. The host is also a participant.

Room codes contain six digits. Rooms remain open for two hours and starting a round renews that period. Participants may join an active round.

## Round data
```text
rooms/{roomCode}/rounds/{roundId}
  status: "preparing" | "active" | "finished"
  playlistId
  playlistName
  createdAt
  startedAt
  finishedAt

rooms/{roomCode}/rounds/{roundId}/songs/{spotifyId}
  spotifyId
  name
  artist
  imageUrl
  spotifyUrl
  position
```

The song pool is immutable while the round is active. Changing playlist requires finishing the round and starting a new one.

## Played songs
The application maintains its own round-specific playback history rather than relying on Spotify's global recently-played list.

```text
rooms/{roomCode}/rounds/{roundId}/playedSongs/{spotifyId}
  spotifyId
  name
  artist
  imageUrl
  spotifyUrl
  position
  playedAt
  playedBy
  sequence
  source: "spotify" | "manual"
```

A document ID is the Spotify track ID, so the same song is recorded only once per round. `sequence` preserves the order in which songs were first registered.

Only the host may write this collection. Every room member may watch it in real time. The host can populate it in two ways:

- `spotify`: the song is read from the current Spotify playback state and registered through the integrated controls;
- `manual`: the host selects the song after playing it in Spotify independently.

The manual path is always available and is the fallback for non-Premium accounts, inactive devices and Spotify playback errors.

## Spotify playback
The host's Spotify profile is checked after authorization. Premium accounts are offered playback controls when Spotify accepts remote playback commands. The application requests:

```text
playlist-read-private
playlist-read-collaborative
user-read-private
user-read-playback-state
user-modify-playback-state
```

Starting a round attempts to enable shuffle and start the selected playlist. If Spotify cannot control playback, the interface falls back to manual mode without blocking the round.

## Cards
Each participant creates `cards/{uid}` transactionally after detecting an active round and its songs. Existing cards are reused after reload. Marks are persisted. Duplicate cards between different participants are acceptable.

## Realtime listeners
- room: closure and active round;
- participants: host participant list;
- round: preparation, active and finished states;
- songs: immutable card pool;
- playedSongs: authoritative playback history;
- card: the current user's card and marks.

## Security model
- Signed-in users may fetch a room by exact code but may not list rooms.
- Participants may read their own participant document and card.
- The host may read all participants and cards.
- Only the host may create rounds, songs and played-song entries.
- Played-song entries must identify the authenticated host in `playedBy` and use `manual` or `spotify` as their source.
- All room members may read played songs while the room is valid.

The versioned `firestore.rules` file must be deployed before relying on these permissions outside development test mode.
