# Rooms and participant entry

## User flow

The landing screen asks the user to choose one role:

- **Host**: reserves a six-digit room number in Firestore, then connects Spotify and prepares the bingo.
- **Participant**: enters a six-digit number and joins without connecting Spotify.

Firebase anonymous authentication supplies the identity for both roles. The public room number is not an authentication credential; it is only the lookup key used to find a private game.

## Room lifetime

Every room is valid for two hours from its creation time.

Room documents include:

```text
rooms/{sixDigitCode}
  hostId: string
  code: string
  status: "open" | "closed" | "resetting"
  createdAt: timestamp
  updatedAt: timestamp
  expiresAt: timestamp
  currentRoundId: string | null
  playlistId: string | null
  playlistName: string | null
```

A room can be joined only when:

1. The document exists.
2. `status` is `open`.
3. `expiresAt` is later than the current time.

The client reports the same user-facing message when the code is missing, closed or expired: `La partida no existe o ya ha caducado.` This avoids exposing unnecessary room state.

## Collision handling

Hosts generate random numbers between `100000` and `999999`. Reservation is performed inside a Firestore transaction.

- If the document does not exist, the transaction creates the room.
- If the code belongs to a room that is still valid, the candidate is rejected and another random number is tried.
- If the existing room has expired, the transaction transfers the code to the new host with status `resetting`.

The transaction prevents two hosts from claiming the same active code concurrently.

## Reusing an expired code

Overwriting a Firestore document does not delete its subcollections. After an expired code is claimed, `RoomSessionService` explicitly deletes the previous contents in this order:

1. Every card under every round.
2. Every round.
3. Every participant.
4. The room status changes from `resetting` to `open`.

Participants cannot join while the room is in `resetting`, preventing a newly joined participant from being removed by the cleanup operation.

## Participant records

Joining creates or refreshes:

```text
rooms/{roomCode}/participants/{firebaseUid}
  userId: string
  displayName: "Participante"
  joinedAt: timestamp
  updatedAt: timestamp
  active: true
```

The Firebase anonymous `uid` is used as the participant document ID, so refreshing the browser does not create duplicate participant records in the same browser profile.

Leaving marks the participant as inactive. The record remains available to support reconnect and future round history until the room expires or the host removes it.

## Browser persistence

The application stores only the selected role and six-digit room number in local storage. On reload:

- A host session is restored only when the room still exists, belongs to the same Firebase `uid`, remains open and has not expired.
- A participant session is restored by joining the room again. If it is no longer available, the application returns to role selection.
- The host role and room number survive the Spotify authorization redirect.

## Security rules

`firestore.rules` enforces:

- exact-code reads only; room listing remains forbidden;
- six-digit room IDs;
- an expiry no more than two hours in the future;
- joining only open, unexpired rooms;
- normal room updates only by the current host;
- takeover only when the previous room has expired;
- a mandatory `resetting` state during takeover;
- host-only deletion of stale participants, rounds and cards.

The rules in the repository must be deployed before testing this flow against a production Firestore database. Test-mode rules do not validate the intended authorization model.

## Current boundary

Real room reservation and participant membership are implemented. Distribution and synchronization of participant cards, round state, line claims and bingo claims remain the next multiplayer milestone.
