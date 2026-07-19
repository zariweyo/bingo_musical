# Firestore security and production deployment

## Purpose

The repository includes `firestore.rules` as the production-oriented source of truth for Cloud Firestore access control. The rules are intentionally stricter than the current test-mode rules configured in the Firebase console.

Do not deploy these rules until the application implements the authentication and document structure described below. Deploying them before that work is complete will block the current unauthenticated prototype.

## Required authentication

Production rules require `request.auth` for every permitted operation.

Before deployment:

1. Enable **Anonymous Authentication** in Firebase Authentication.
2. Sign every host and participant in anonymously before reading or writing game data.
3. Keep the returned Firebase `uid` stable for the browser session.
4. Store that `uid` as `hostId` for hosts and `userId` for participants.

Anonymous authentication does not require players to create an account, but it gives Firestore a trustworthy identity for authorization.

## Expected data model

```text
rooms/{roomCode}
  hostId: string
  code: string
  status: "open" | "closed"
  createdAt: timestamp
  updatedAt: timestamp
  currentRoundId?: string | null
  playlistId?: string | null
  playlistName?: string | null

rooms/{roomCode}/participants/{userId}
  userId: string
  displayName: string
  joinedAt: timestamp
  updatedAt: timestamp
  active: boolean

rooms/{roomCode}/rounds/{roundId}
  status: "preparing" | "active" | "finished"
  createdAt: timestamp
  startedAt?: timestamp | null
  finishedAt?: timestamp | null
  trackIds: string[]

rooms/{roomCode}/rounds/{roundId}/cards/{userId}
  userId: string
  trackIds: string[]
  markedTrackIds: string[]
  lineClaimedAt?: timestamp | null
  bingoClaimedAt?: timestamp | null
  createdAt: timestamp
  updatedAt: timestamp
```

The room document ID must equal its public room code. Participant and card document IDs must equal the authenticated user's Firebase `uid`.

## Access model

- Authenticated users may fetch a room by an exact code, but cannot list all rooms.
- Only the host can create, update or delete their room.
- A participant may join an open room only under their own `uid`.
- Hosts can manage participants, rounds and cards in their room.
- Participants can read only their own participant record and card.
- Participants can update only their card play-state fields: marked songs, line claim, bingo claim and update timestamp.
- Unknown collections and paths are denied by default.

## Deployment by copy and paste

1. Open Firebase Console.
2. Select project `simple-estatico`.
3. Open **Firestore Database → Rules**.
4. Replace the editor contents with the complete contents of `firestore.rules`.
5. Review the active application version and publish the rules.
6. Test host and participant flows immediately after publishing.

## Deployment with Firebase CLI

A future `firebase.json` may point Firestore at this file. Until then, the file can be deployed explicitly after configuring the Firebase CLI project:

```bash
firebase login
firebase use simple-estatico
firebase deploy --only firestore:rules
```

Before using CLI deployment, verify that the active Firebase project is `simple-estatico` and that the local configuration maps Firestore rules to `firestore.rules`.

## Production checklist

- Anonymous Authentication is enabled.
- The app signs in before any Firestore operation.
- Room, participant, round and card paths match the documented model.
- Server timestamps are used for audit fields.
- Room codes are sufficiently resistant to guessing or rate-limited through the application flow.
- Rules are tested in the Firebase Emulator Suite for host, participant and unauthenticated cases.
- Test-mode rules are no longer active.
- No service-account credentials or private keys are included in the client repository.

## Important limitation

Firestore rules can authorize access, but they cannot fully prevent automated room-code guessing when clients are allowed to fetch a room by exact code. Before public launch, consider longer invitation codes, expiring rooms, App Check and rate limiting through a trusted backend or Cloud Function.
