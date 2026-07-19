import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  DocumentData,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { AnonymousAuthService } from './anonymous-auth.service';

export type SessionRole = 'host' | 'participant';

interface RoomDocument extends DocumentData {
  hostId: string;
  code: string;
  status: 'open' | 'closed' | 'resetting';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
  currentRoundId: string | null;
  playlistId: string | null;
  playlistName: string | null;
}

export class RoomNotFoundError extends Error {
  constructor() {
    super('La partida no existe o ya ha caducado.');
  }
}

@Injectable({ providedIn: 'root' })
export class RoomSessionService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AnonymousAuthService);
  private readonly ttlMs = 2 * 60 * 60 * 1000;
  private readonly maxCodeAttempts = 30;

  async createHostRoom(): Promise<string> {
    const uid = this.requireUid();

    for (let attempt = 0; attempt < this.maxCodeAttempts; attempt += 1) {
      const code = this.generateCode();
      const roomRef = doc(this.firestore, `rooms/${code}`);
      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + this.ttlMs);
      let reusedExpiredRoom = false;

      const claimed = await runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(roomRef);

        if (!snapshot.exists()) {
          transaction.set(roomRef, this.newRoom(uid, code, now, expiresAt, 'open'));
          return true;
        }

        const room = snapshot.data() as Partial<RoomDocument>;
        const expired = !(room.expiresAt instanceof Timestamp) || room.expiresAt.toMillis() <= now.toMillis();

        if (!expired) {
          return false;
        }

        reusedExpiredRoom = true;
        transaction.set(roomRef, this.newRoom(uid, code, now, expiresAt, 'resetting'));
        return true;
      });

      if (!claimed) {
        continue;
      }

      if (reusedExpiredRoom) {
        await this.clearRoomContents(code);
        await updateDoc(roomRef, { status: 'open', updatedAt: Timestamp.now() });
      }

      return code;
    }

    throw new Error('No se pudo reservar un número de partida. Inténtalo de nuevo.');
  }

  async resumeHostRoom(code: string): Promise<boolean> {
    if (!/^\d{6}$/.test(code)) {
      return false;
    }

    const snapshot = await getDoc(doc(this.firestore, `rooms/${code}`));
    if (!snapshot.exists()) {
      return false;
    }

    const room = snapshot.data() as RoomDocument;
    return (
      room.hostId === this.requireUid() &&
      room.status === 'open' &&
      room.expiresAt instanceof Timestamp &&
      room.expiresAt.toMillis() > Date.now()
    );
  }

  async joinRoom(rawCode: string): Promise<string> {
    const code = rawCode.replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(code)) {
      throw new RoomNotFoundError();
    }

    const uid = this.requireUid();
    const roomRef = doc(this.firestore, `rooms/${code}`);
    const participantRef = doc(this.firestore, `rooms/${code}/participants/${uid}`);

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) {
        throw new RoomNotFoundError();
      }

      const room = snapshot.data() as RoomDocument;
      const isAvailable =
        room.status === 'open' &&
        room.expiresAt instanceof Timestamp &&
        room.expiresAt.toMillis() > Date.now();

      if (!isAvailable) {
        throw new RoomNotFoundError();
      }

      const now = Timestamp.now();
      transaction.set(
        participantRef,
        {
          userId: uid,
          displayName: 'Participante',
          joinedAt: now,
          updatedAt: now,
          active: true,
        },
        { merge: true },
      );
    });

    return code;
  }

  async leaveRoom(code: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid || !/^\d{6}$/.test(code)) {
      return;
    }

    await setDoc(
      doc(this.firestore, `rooms/${code}/participants/${uid}`),
      { active: false, updatedAt: Timestamp.now() },
      { merge: true },
    );
  }

  async closeHostRoom(code: string): Promise<void> {
    if (!/^\d{6}$/.test(code)) {
      return;
    }

    const roomRef = doc(this.firestore, `rooms/${code}`);
    const snapshot = await getDoc(roomRef);
    if (snapshot.exists() && snapshot.data()['hostId'] === this.requireUid()) {
      await updateDoc(roomRef, { status: 'closed', updatedAt: Timestamp.now() });
    }
  }

  private newRoom(
    hostId: string,
    code: string,
    createdAt: Timestamp,
    expiresAt: Timestamp,
    status: RoomDocument['status'],
  ): RoomDocument {
    return {
      hostId,
      code,
      status,
      createdAt,
      updatedAt: createdAt,
      expiresAt,
      currentRoundId: null,
      playlistId: null,
      playlistName: null,
    };
  }

  private async clearRoomContents(code: string): Promise<void> {
    const rounds = await getDocs(collection(this.firestore, `rooms/${code}/rounds`));

    for (const round of rounds.docs) {
      const cards = await getDocs(collection(this.firestore, `rooms/${code}/rounds/${round.id}/cards`));
      await Promise.all(cards.docs.map((card) => deleteDoc(card.ref)));
      await deleteDoc(round.ref);
    }

    const participants = await getDocs(collection(this.firestore, `rooms/${code}/participants`));
    await Promise.all(participants.docs.map((participant) => deleteDoc(participant.ref)));
  }

  private generateCode(): string {
    const values = crypto.getRandomValues(new Uint32Array(1));
    return String(100000 + (values[0] % 900000));
  }

  private requireUid(): string {
    const uid = this.auth.uid();
    if (!uid) {
      throw new Error('La identidad anónima todavía no está disponible. Recarga la aplicación.');
    }
    return uid;
  }
}
