# Product definition

## Problem
Preparing a music bingo manually requires choosing songs, creating cards, distributing them and checking winners. The product turns a Spotify playlist into a private multiplayer game with minimal preparation.

## Identity and room flow
Every browser receives an anonymous Firebase `uid`. The user chooses a display name, which is stored in `users/{uid}` and copied into the room participant document. The host is also a participant and receives a normal card.

## Host journey
1. Create a six-digit room and share it.
2. Connect Spotify and choose a playlist.
3. Start a round. The valid songs are copied to Firestore and frozen for that round.
4. If Spotify reports a Premium account and playback is available, use the integrated controls: random start, play/pause, previous, next and ±15 seconds.
5. If integrated playback is unavailable, play the playlist in the official Spotify app and select the song that has just played in Bingo Musical.
6. In both modes, register each played song in the round history.
7. End the round and return to preparation without changing the room code.

## Participant journey
Participants may join before or after the round starts. Each browser creates its own 15-song card transactionally, restores it after reload and persists its marks.

## Playback modes
Integrated playback is an optional convenience, not a requirement for the game.

### Spotify controls available
For compatible Premium accounts with an active Spotify device, the host can:
- start the selected playlist with shuffle enabled;
- play or pause;
- move to the previous or next track;
- seek backward or forward 15 seconds;
- register the current Spotify track as played.

The authorization includes `user-read-private`, `user-read-playback-state` and `user-modify-playback-state` in addition to playlist access.

### Manual fallback
If the account is not Premium, there is no active Spotify device, or Spotify rejects playback control, the interface explains that playback must be handled in Spotify. The host can still select any round song and mark it as played. This keeps all bingo functionality available to free accounts.

## Played-song history
Each song is registered at most once per round:

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

All room members may read this history. Only the host may create, update or delete entries. The history is the future source of truth for validating line and bingo claims; participant card marks alone are not authoritative.

## Firestore model
```text
users/{uid}
rooms/{roomCode}
rooms/{roomCode}/participants/{uid}
rooms/{roomCode}/rounds/{roundId}
rooms/{roomCode}/rounds/{roundId}/songs/{spotifyId}
rooms/{roomCode}/rounds/{roundId}/playedSongs/{spotifyId}
rooms/{roomCode}/rounds/{roundId}/cards/{uid}
```

## Current implementation
- Spotify Authorization Code with PKCE and refresh tokens.
- Anonymous Firebase Authentication.
- Persistent rooms, participants, rounds, cards and marks.
- Immutable songs per round and late joins.
- Optional Spotify playback controls for compatible Premium sessions.
- Universal manual song registration fallback.
- Realtime played-song history.
- Firestore rules allowing only the host to mutate played songs.

## Still excluded
- Automatic line and bingo validation.
- Reliable realtime presence and host handover.
- Automatic deployment of Firestore rules.
- Permanent accounts, payments, prizes and public room discovery.
