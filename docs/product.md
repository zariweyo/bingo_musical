# Product definition

## Problem

Preparing a music bingo manually requires choosing songs, creating cards, distributing them and checking winners. The product turns a Spotify playlist into a private multiplayer game with minimal preparation.

## Entry and identity

1. Every browser receives a persistent anonymous Firebase `uid`.
2. Before choosing a role, the user enters a display name.
3. The name is stored in `users/{uid}`.
4. When the user enters a room, the name is copied to `rooms/{roomCode}/participants/{uid}`.
5. The host is also a participant and receives a card through the same mechanism.

## Host journey

1. Chooses `Ser anfitrión`.
2. The application reserves a random six-digit room code in Firestore.
3. A participant document is created for the host with `role: "host"`.
4. Connects Spotify and selects a playlist.
5. Shares the room code and can see the participant list in real time.
6. Presses `Iniciar bingo`.
7. The application creates a new round and copies the complete valid song list into its `songs` subcollection.
8. The song list becomes immutable while the round is active.
9. The host automatically creates and stores their own card, exactly like every other participant.
10. Ending the round returns to preparation. Another round always starts from zero with a new `roundId`, songs and cards.

## Participant journey

1. Chooses `Unirme a una partida` and enters the six-digit code.
2. Can join before or after the round starts.
3. Watches the room and active round through Firestore snapshots.
4. When an active round and its songs are available, checks for `cards/{uid}`.
5. If the card does not exist, generates a random 15-song card locally and creates it transactionally.
6. If the card already exists, loads it unchanged.
7. Marks are persisted in Firestore and survive browser reloads.
8. Leaving the room asks for confirmation, marks the participant inactive and returns to the home screen.

## Current implementation

- Spotify Authorization Code with PKCE and automatic refresh-token renewal.
- Anonymous Firebase Authentication with local persistence.
- Mandatory display name stored under the anonymous Firebase `uid`.
- Explicit host and participant roles.
- Six-digit Firestore room codes with transactional collision handling.
- Rooms expire two hours after creation; starting a round renews the expiry for another two hours.
- Expired codes may be claimed, cleaned and reused.
- Changing a room code requires confirmation and closes the previous room.
- Participants may join an active round at any time.
- The host appears in the room participant collection and receives a normal participant card.
- Participant lists update in real time through Firestore snapshots.
- Starting a round copies all valid Spotify tracks into `rooms/{roomCode}/rounds/{roundId}/songs`.
- Songs cannot change during an active round.
- Each browser generates only its own card.
- Card creation uses a Firestore transaction so reloads or concurrent tabs cannot replace an existing card.
- Duplicate cards between different participants are allowed.
- Card marks are saved after every change.
- The host can read every participant and, under the security model, every card in their room.
- A participant can read only their own participant record and card.
- Line and bingo claim validation remain future work.

## Firestore model

```text
users/{uid}
  userId
  displayName
  createdAt
  updatedAt

rooms/{roomCode}
  hostId
  code
  status
  createdAt
  updatedAt
  expiresAt
  currentRoundId
  playlistId
  playlistName

rooms/{roomCode}/participants/{uid}
  userId
  displayName
  role
  active
  joinedAt
  updatedAt

rooms/{roomCode}/rounds/{roundId}
  status
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

rooms/{roomCode}/rounds/{roundId}/cards/{uid}
  userId
  roundId
  songIds
  markedSongIds
  lineClaimedAt
  bingoClaimedAt
  createdAt
  updatedAt
```

## Product rules

- A room remains joinable while it is open and not expired.
- Participants may join an already active round.
- Songs are frozen once a round starts.
- Changing songs requires finishing the round and starting another from zero.
- Every new round creates new cards.
- A card is unique only for the tuple `roomCode + roundId + uid`.
- Different participants may receive identical cards.
- Reloading never regenerates an existing card.
- The host is a participant with additional privileges, not a separate player type.
- The room code alone identifies the room; the Firebase `uid` identifies the person and card owner.

## Still excluded

- Permanent user accounts or recovery after deleting browser data.
- Automatic deployment of Firestore rules.
- Line and bingo claims and host validation.
- Trusted backend rate limiting and App Check enforcement.
- Audio streaming inside the application.
- Payments, prizes and public room discovery.
