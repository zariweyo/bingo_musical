# Rooms, participants and rounds

## Identity and names

Firebase anonymous authentication supplies the stable browser identity for both roles. Before choosing a role, the user enters a display name, stored at:

```text
users/{firebaseUid}
  userId
  displayName
  createdAt
  updatedAt
```

When entering a room, that name is copied into the room participant document. The host is also represented as a participant.

## Room lifetime and codes

Room codes contain six digits and are reserved transactionally. A room is joinable only while its document exists, has `status: "open"`, and `expiresAt` is in the future.

```text
rooms/{sixDigitCode}
  hostId
  code
  status: "open" | "closed" | "resetting"
  createdAt
  updatedAt
  expiresAt
  currentRoundId
  playlistId
  playlistName
```

The initial validity is two hours. Starting a round renews `expiresAt` for another two hours so an active game does not expire immediately after beginning.

If a generated code is already active, another random code is tried. If it is expired, it is claimed in `resetting` state, all old participants, rounds, songs and cards are removed, and it is reopened.

Changing the room number requires confirmation. The old room is closed, which invalidates existing participant sessions, and a new room is created for the host.

## Participants

```text
rooms/{roomCode}/participants/{firebaseUid}
  userId
  displayName
  role: "host" | "participant"
  active
  joinedAt
  updatedAt
```

Participants may enter before or after a round starts. Leaving marks the document inactive rather than deleting it. Rejoining from the same browser reactivates the record and preserves the same Firebase `uid`.

The host listens to the participant collection and sees names, roles and active state in real time.

## Rounds and immutable songs

Starting a game creates a new round in `preparing` state. The host copies every valid Spotify song into the round's `songs` collection. Only after all song batches have been written does the round become `active` and the room's `currentRoundId` change.

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

Songs do not change during an active round. A different playlist or song selection requires ending the current round and starting a completely new round.

## Autonomous card creation

Every room member watches `currentRoundId`, the round and its songs through Firestore snapshots. Once the round is active and at least 15 songs are available, that browser checks:

```text
rooms/{roomCode}/rounds/{roundId}/cards/{firebaseUid}
```

If the card exists, it is loaded. If it does not, the browser chooses 15 songs and creates the document inside a Firestore transaction. This gives each participant autonomy while preventing reloads or concurrent tabs from replacing an existing card.

```text
rooms/{roomCode}/rounds/{roundId}/cards/{firebaseUid}
  userId
  roundId
  songIds
  markedSongIds
  lineClaimedAt
  bingoClaimedAt
  createdAt
  updatedAt
```

Different participants may receive identical cards. Uniqueness between users is not required. The host receives a card through exactly the same mechanism.

Marks are updated in Firestore after every change and are restored after reload. A participant cannot change `songIds` after card creation.

## Realtime behavior

- The room snapshot announces closure and new rounds.
- The round snapshot announces `preparing`, `active` and `finished` states.
- The song snapshot supplies the immutable pool used to generate cards.
- The card snapshot restores marks and card contents.
- The participant snapshot supplies the host's participant list.
- Late participants automatically create their card for the current active round.

## Security model

- Signed-in users may fetch a room by exact code, but cannot list rooms.
- Users may read and update only their own profile.
- Participants may read only their own participant record and card.
- The host may read all participants and cards in their room.
- Only the host may create rounds and write songs.
- Each participant may create only `cards/{theirUid}` with exactly 15 songs.
- Card owners may update marks and future claims, but not identity, round or song IDs.
- Room, round and song mutation remains host-only.

The versioned `firestore.rules` file must be deployed before this authorization model is relied upon outside development test mode.
