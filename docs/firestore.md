# Firestore security and production deployment

## Purpose

The repository includes `firestore.rules` as the production-oriented source of truth for Cloud Firestore access control. The rules are intentionally stricter than test-mode rules.

Real room reservation and participant membership now use the Firestore paths described below. Deploy and test the repository rules before relying on the two-hour room lifecycle in production.

## AngularFire integration rule

AngularFire is used for Angular dependency injection and provider registration. Firebase SDK factories, constants and operations must be imported from the official modular SDK packages:

- `firebase/app` for `initializeApp`.
- `firebase/auth` for `getAuth`, persistence constants and authentication operations.
- `firebase/firestore` for transactions and Firestore document operations.

Do not import constructor-like Firebase values such as `browserLocalPersistence` from AngularFire wrappers. Production minification can otherwise cause errors such as `TypeError: t is not a constructor`.

## Anonymous authentication

Firebase Authentication initializes during Angular bootstrap and every browser signs in anonymously through `AnonymousAuthService`.

The anonymous `uid` is used as:

- `hostId` for rooms owned by the host;
- `userId` and document ID for participant records;
- the document ID of participant-owned cards.

The `uid` is not a secret and must not be used as the public invitation code. Enable **Anonymous Authentication** in Firebase Console under **Authentication → Sign-in method** before testing.

## Data model

```text
rooms/{sixDigitRoomCode}
  hostId: string
  code: string
  status: "open" | "closed" | "resetting"
  createdAt: timestamp
  updatedAt: timestamp
  expiresAt: timestamp
  currentRoundId: string | null
  playlistId: string | null
  playlistName: string | null

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

The room document ID and `code` field must be the same six-digit value. Participant and card document IDs must equal the authenticated Firebase `uid`.

## Two-hour room lifecycle

- New rooms must expire no more than two hours after the Firestore request time.
- Participants can join only when the room is `open` and `expiresAt` is still in the future.
- Active codes cannot be claimed by another host.
- An expired code may be claimed by a new host only in `resetting` state.
- While resetting, the new host deletes old cards, rounds and participants.
- The room becomes `open` only after cleanup finishes.

Firestore does not automatically delete subcollections when a parent document is overwritten. The explicit cleanup in `RoomSessionService` is therefore required to prevent data from a previous room leaking into a reused code.

See `docs/rooms.md` for the full collision and browser-restoration flow.

## Access model

- Authenticated users may fetch a room by exact code but cannot list all rooms.
- The current host can maintain and close their room without changing its identity or expiry.
- A different host can claim only an expired room code.
- A participant may join an open, unexpired room only under their own `uid`.
- Hosts manage participants, rounds and cards in their room.
- Participants read only their own participant record and card.
- Unknown collections and paths are denied by default.

## Deployment by copy and paste

1. Open Firebase Console.
2. Select project `simple-estatico`.
3. Confirm Anonymous Authentication is enabled.
4. Open **Firestore Database → Rules**.
5. Replace the editor contents with the complete contents of `firestore.rules`.
6. Publish the rules.
7. Test host creation, collision handling, joining, expiry and expired-code reuse.

## Deployment with Firebase CLI

```bash
firebase login
firebase use simple-estatico
firebase deploy --only firestore:rules
```

Before CLI deployment, verify that the active project is `simple-estatico` and that the Firebase configuration maps Firestore rules to `firestore.rules`.

## Production checklist

- Anonymous Authentication is enabled.
- The app signs in before any Firestore operation.
- Firebase factories and persistence values are imported from `firebase/*`.
- Room IDs contain exactly six digits.
- `expiresAt` is no more than two hours after creation.
- Participants cannot join missing, closed, resetting or expired rooms.
- Expired-room cleanup removes cards, rounds and participants before reopening.
- Participant and card document IDs match the authenticated `uid`.
- Rules are tested in the Firebase Emulator Suite, including simultaneous host claims.
- Test-mode rules are no longer active.
- No service-account credentials or private keys are committed.

## Important limitations

Anonymous authentication identifies a browser installation, not a verified human. Clearing browser data can orphan ownership of a still-active room.

Six-digit codes and exact-code reads do not fully prevent automated guessing. Before public launch, consider Firebase App Check, request throttling through a trusted backend and abuse monitoring.

Client-side cleanup is adequate for the current prototype, but a trusted scheduled backend cleanup should eventually remove expired rooms that are never selected for reuse.
