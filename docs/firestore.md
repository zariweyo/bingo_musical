# Firestore security and production deployment

## Purpose

The repository includes `firestore.rules` as the production-oriented source of truth for Cloud Firestore access control. The rules are intentionally stricter than the current test-mode rules configured in the Firebase console.

Do not deploy these rules until the application writes documents using the structure described below. Anonymous authentication is already implemented, but the current local room and round prototype has not yet been migrated to these Firestore paths.

## Anonymous authentication

Firebase Authentication is initialized during Angular bootstrap and every browser signs in anonymously in the background through `AnonymousAuthService`.

The service:

1. Uses Firebase local authentication persistence.
2. Reuses an existing anonymous user when one is already stored in the browser.
3. Creates a new anonymous user with `signInAnonymously` when needed.
4. Exposes the current Firebase user and `uid` to application services.
5. Completes before the Angular application finishes starting.

Anonymous authentication does not require registration, email or password, but gives Firestore a trustworthy identity for authorization.

The anonymous `uid` normally remains stable across reloads and future visits from the same browser profile. It can change when the user clears site data, uses private browsing, changes browser profile or manually deletes the Firebase user.

Use that `uid` as:

- `hostId` for rooms owned by the host.
- `userId` for participant records.
- The document ID of each participant and participant-owned card.

The `uid` is not a secret, but it must not be used as the public invitation code.

Before testing authentication, enable **Anonymous Authentication** in Firebase Console under **Authentication → Sign-in method**. If the provider is disabled, application bootstrap will fail because the background sign-in cannot complete.

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
- Only the host whose `uid` equals `hostId` can create, update or delete their room.
- A participant may join an open room only under their own `uid`.
- Hosts can manage participants, rounds and cards in their room.
- Participants can read only their own participant record and card.
- Participants can update only their card play-state fields: marked songs, line claim, bingo claim and update timestamp.
- Unknown collections and paths are denied by default.

## Deployment by copy and paste

1. Open Firebase Console.
2. Select project `simple-estatico`.
3. Confirm Anonymous Authentication is enabled.
4. Open **Firestore Database → Rules**.
5. Replace the editor contents with the complete contents of `firestore.rules`.
6. Review the active application version and publish the rules.
7. Test host and participant flows immediately after publishing.

## Deployment with Firebase CLI

A future `firebase.json` may point Firestore at this file. Until then, the file can be deployed explicitly after configuring the Firebase CLI project:

```bash
firebase login
firebase use simple-estatico
firebase deploy --only firestore:rules
```

Before using CLI deployment, verify that the active Firebase project is `simple-estatico` and that the local configuration maps Firestore rules to `firestore.rules`.

## Production checklist

- Anonymous Authentication is enabled in Firebase Console.
- The app signs in before any Firestore operation.
- Authentication failures are surfaced and do not silently continue with unauthenticated Firestore requests.
- Room documents store the authenticated host `uid` as `hostId`.
- Participant and card document IDs match the authenticated participant `uid`.
- Room, participant, round and card paths match the documented model.
- Server timestamps are used for audit fields.
- Room codes are sufficiently resistant to guessing or rate-limited through the application flow.
- Rules are tested in the Firebase Emulator Suite for host, participant and unauthenticated cases.
- Test-mode rules are no longer active.
- No service-account credentials or private keys are included in the client repository.

## Important limitations

Anonymous authentication identifies a browser installation, not a verified human identity. Clearing browser data can orphan ownership of rooms created with the previous anonymous `uid`. Before supporting long-lived rooms, consider an account-linking or recovery strategy for hosts.

Firestore rules can authorize access, but they cannot fully prevent automated room-code guessing when clients are allowed to fetch a room by exact code. Before public launch, consider longer invitation codes, expiring rooms, App Check and rate limiting through a trusted backend or Cloud Function.
