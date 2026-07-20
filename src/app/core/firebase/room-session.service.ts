import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  DocumentData,
  Timestamp,
  Unsubscribe,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { AnonymousAuthService } from './anonymous-auth.service';

export type SessionRole = 'host' | 'participant';
export type RoomStatus = 'open' | 'closed' | 'resetting';
export type RoundStatus = 'preparing' | 'active' | 'finished';

export interface UserProfile extends DocumentData {
  userId: string;
  displayName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RoomDocument extends DocumentData {
  hostId: string;
  code: string;
  status: RoomStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
  currentRoundId: string | null;
  playlistId: string | null;
  playlistName: string | null;
}

export interface ParticipantDocument extends DocumentData {
  userId: string;
  displayName: string;
  role: SessionRole;
  active: boolean;
  joinedAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RoundDocument extends DocumentData {
  status: RoundStatus;
  playlistId: string;
  playlistName: string;
  createdAt: Timestamp;
  startedAt: Timestamp | null;
  finishedAt: Timestamp | null;
}

export interface RoundSong extends DocumentData {
  spotifyId: string;
  name: string;
  artist: string;
  imageUrl: string;
  spotifyUrl: string;
  position: number;
}

export interface BingoCardDocument extends DocumentData {
  userId: string;
  roundId: string;
  songIds: string[];
  markedSongIds: string[];
  lineClaimedAt: Timestamp | null;
  bingoClaimedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
  private readonly cardSize = 15;

  async saveDisplayName(rawName: string): Promise<string> {
    const displayName = rawName.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (displayName.length < 2) {
      throw new Error('Escribe un nombre de al menos dos caracteres.');
    }

    const uid = this.requireUid();
    const profileRef = doc(this.firestore, `users/${uid}`);
    const snapshot = await getDoc(profileRef);
    const now = Timestamp.now();

    await setDoc(
      profileRef,
      {
        userId: uid,
        displayName,
        createdAt: snapshot.exists() ? snapshot.data()['createdAt'] ?? now : now,
        updatedAt: now,
      } satisfies UserProfile,
      { merge: true },
    );

    return displayName;
  }

  async loadDisplayName(): Promise<string> {
    const uid = this.requireUid();
    const snapshot = await getDoc(doc(this.firestore, `users/${uid}`));
    return snapshot.exists() ? String(snapshot.data()['displayName'] ?? '') : '';
  }

  async createHostRoom(displayName: string): Promise<string> {
    const uid = this.requireUid();

    for (let attempt = 0; attempt < this.maxCodeAttempts; attempt += 1) {
      const code = this.generateCode();
      const roomRef = doc(this.firestore, `rooms/${code}`);
      const participantRef = doc(this.firestore, `rooms/${code}/participants/${uid}`);
      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + this.ttlMs);
      let reusedExpiredRoom = false;

      const claimed = await runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(roomRef);

        if (!snapshot.exists()) {
          transaction.set(roomRef, this.newRoom(uid, code, now, expiresAt, 'open'));
          transaction.set(participantRef, this.newParticipant(uid, displayName, 'host', now));
          return true;
        }

        const room = snapshot.data() as Partial<RoomDocument>;
        const expired = !(room.expiresAt instanceof Timestamp) || room.expiresAt.toMillis() <= now.toMillis();
        if (!expired) return false;

        reusedExpiredRoom = true;
        transaction.set(roomRef, this.newRoom(uid, code, now, expiresAt, 'resetting'));
        return true;
      });

      if (!claimed) continue;

      if (reusedExpiredRoom) {
        await this.clearRoomContents(code);
        const readyAt = Timestamp.now();
        await setDoc(participantRef, this.newParticipant(uid, displayName, 'host', readyAt));
        await updateDoc(roomRef, { status: 'open', updatedAt: readyAt });
      }

      return code;
    }

    throw new Error('No se pudo reservar un número de partida. Inténtalo de nuevo.');
  }

  async resumeRoom(code: string, role: SessionRole): Promise<boolean> {
    if (!/^\d{6}$/.test(code)) return false;
    const uid = this.requireUid();
    const roomSnapshot = await getDoc(doc(this.firestore, `rooms/${code}`));
    const participantSnapshot = await getDoc(doc(this.firestore, `rooms/${code}/participants/${uid}`));
    if (!roomSnapshot.exists() || !participantSnapshot.exists()) return false;

    const room = roomSnapshot.data() as RoomDocument;
    const participant = participantSnapshot.data() as ParticipantDocument;
    const valid = room.status === 'open' && room.expiresAt instanceof Timestamp && room.expiresAt.toMillis() > Date.now();
    const correctRole = role === 'host' ? room.hostId === uid : participant.role === 'participant';

    if (!valid || !correctRole) return false;
    await updateDoc(participantSnapshot.ref, { active: true, updatedAt: Timestamp.now() });
    return true;
  }

  async joinRoom(rawCode: string, displayName: string): Promise<string> {
    const code = rawCode.replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(code)) throw new RoomNotFoundError();

    const uid = this.requireUid();
    const roomRef = doc(this.firestore, `rooms/${code}`);
    const participantRef = doc(this.firestore, `rooms/${code}/participants/${uid}`);

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new RoomNotFoundError();

      const room = snapshot.data() as RoomDocument;
      const joinable = room.status === 'open' && room.expiresAt instanceof Timestamp && room.expiresAt.toMillis() > Date.now();
      if (!joinable) throw new RoomNotFoundError();

      const participantSnapshot = await transaction.get(participantRef);
      const now = Timestamp.now();
      transaction.set(
        participantRef,
        {
          userId: uid,
          displayName,
          role: room.hostId === uid ? 'host' : 'participant',
          active: true,
          joinedAt: participantSnapshot.exists() ? participantSnapshot.data()['joinedAt'] ?? now : now,
          updatedAt: now,
        } satisfies ParticipantDocument,
        { merge: true },
      );
    });

    return code;
  }

  watchRoom(code: string, callback: (room: RoomDocument | null) => void): Unsubscribe {
    return onSnapshot(doc(this.firestore, `rooms/${code}`), (snapshot) => {
      callback(snapshot.exists() ? (snapshot.data() as RoomDocument) : null);
    });
  }

  watchParticipants(code: string, callback: (participants: ParticipantDocument[]) => void): Unsubscribe {
    return onSnapshot(collection(this.firestore, `rooms/${code}/participants`), (snapshot) => {
      callback(snapshot.docs.map((item) => item.data() as ParticipantDocument));
    });
  }

  watchRound(code: string, roundId: string, callback: (round: RoundDocument | null) => void): Unsubscribe {
    return onSnapshot(doc(this.firestore, `rooms/${code}/rounds/${roundId}`), (snapshot) => {
      callback(snapshot.exists() ? (snapshot.data() as RoundDocument) : null);
    });
  }

  watchSongs(code: string, roundId: string, callback: (songs: RoundSong[]) => void): Unsubscribe {
    return onSnapshot(collection(this.firestore, `rooms/${code}/rounds/${roundId}/songs`), (snapshot) => {
      const songs = snapshot.docs.map((item) => item.data() as RoundSong).sort((a, b) => a.position - b.position);
      callback(songs);
    });
  }

  watchCard(code: string, roundId: string, callback: (card: BingoCardDocument | null) => void): Unsubscribe {
    const uid = this.requireUid();
    return onSnapshot(doc(this.firestore, `rooms/${code}/rounds/${roundId}/cards/${uid}`), (snapshot) => {
      callback(snapshot.exists() ? (snapshot.data() as BingoCardDocument) : null);
    });
  }

  async startRound(code: string, playlistId: string, playlistName: string, songs: RoundSong[]): Promise<string> {
    const uid = this.requireUid();
    if (songs.length < this.cardSize) throw new Error(`La ronda necesita al menos ${this.cardSize} canciones.`);

    const roomRef = doc(this.firestore, `rooms/${code}`);
    const roundRef = doc(collection(this.firestore, `rooms/${code}/rounds`));
    const now = Timestamp.now();

    await runTransaction(this.firestore, async (transaction) => {
      const roomSnapshot = await transaction.get(roomRef);
      if (!roomSnapshot.exists()) throw new RoomNotFoundError();
      const room = roomSnapshot.data() as RoomDocument;
      if (room.hostId !== uid) throw new Error('Solo el anfitrión puede iniciar la partida.');
      if (room.currentRoundId) throw new Error('Ya hay una ronda activa. Termínala antes de empezar otra.');

      transaction.set(roundRef, {
        status: 'preparing',
        playlistId,
        playlistName,
        createdAt: now,
        startedAt: null,
        finishedAt: null,
      } satisfies RoundDocument);
    });

    for (let offset = 0; offset < songs.length; offset += 400) {
      const batch = writeBatch(this.firestore);
      for (const song of songs.slice(offset, offset + 400)) {
        batch.set(doc(this.firestore, `rooms/${code}/rounds/${roundRef.id}/songs/${song.spotifyId}`), song);
      }
      await batch.commit();
    }

    const startedAt = Timestamp.now();
    const finalBatch = writeBatch(this.firestore);
    finalBatch.update(roundRef, { status: 'active', startedAt });
    finalBatch.update(roomRef, {
      currentRoundId: roundRef.id,
      playlistId,
      playlistName,
      updatedAt: startedAt,
      expiresAt: Timestamp.fromMillis(startedAt.toMillis() + this.ttlMs),
    });
    await finalBatch.commit();
    return roundRef.id;
  }

  async finishRound(code: string, roundId: string): Promise<void> {
    const uid = this.requireUid();
    const roomRef = doc(this.firestore, `rooms/${code}`);
    const roundRef = doc(this.firestore, `rooms/${code}/rounds/${roundId}`);

    await runTransaction(this.firestore, async (transaction) => {
      const roomSnapshot = await transaction.get(roomRef);
      if (!roomSnapshot.exists() || roomSnapshot.data()['hostId'] !== uid) {
        throw new Error('Solo el anfitrión puede terminar la partida.');
      }
      const now = Timestamp.now();
      transaction.update(roundRef, { status: 'finished', finishedAt: now });
      transaction.update(roomRef, { currentRoundId: null, updatedAt: now });
    });
  }

  async ensureCard(code: string, roundId: string, songs: RoundSong[]): Promise<BingoCardDocument> {
    if (songs.length < this.cardSize) throw new Error('Todavía se están cargando las canciones de la ronda.');
    const uid = this.requireUid();
    const cardRef = doc(this.firestore, `rooms/${code}/rounds/${roundId}/cards/${uid}`);

    return runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(cardRef);
      if (snapshot.exists()) return snapshot.data() as BingoCardDocument;

      const now = Timestamp.now();
      const card: BingoCardDocument = {
        userId: uid,
        roundId,
        songIds: this.shuffle(songs.map((song) => song.spotifyId)).slice(0, this.cardSize),
        markedSongIds: [],
        lineClaimedAt: null,
        bingoClaimedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      transaction.set(cardRef, card);
      return card;
    });
  }

  async updateMarkedSongs(code: string, roundId: string, markedSongIds: string[]): Promise<void> {
    const uid = this.requireUid();
    await updateDoc(doc(this.firestore, `rooms/${code}/rounds/${roundId}/cards/${uid}`), {
      markedSongIds,
      updatedAt: Timestamp.now(),
    });
  }

  async leaveRoom(code: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid || !/^\d{6}$/.test(code)) return;
    await setDoc(
      doc(this.firestore, `rooms/${code}/participants/${uid}`),
      { active: false, updatedAt: Timestamp.now() },
      { merge: true },
    );
  }

  async closeHostRoom(code: string): Promise<void> {
    if (!/^\d{6}$/.test(code)) return;
    const roomRef = doc(this.firestore, `rooms/${code}`);
    const snapshot = await getDoc(roomRef);
    if (snapshot.exists() && snapshot.data()['hostId'] === this.requireUid()) {
      await updateDoc(roomRef, { status: 'closed', currentRoundId: null, updatedAt: Timestamp.now() });
    }
  }

  private newRoom(hostId: string, code: string, createdAt: Timestamp, expiresAt: Timestamp, status: RoomStatus): RoomDocument {
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

  private newParticipant(userId: string, displayName: string, role: SessionRole, now: Timestamp): ParticipantDocument {
    return { userId, displayName, role, active: true, joinedAt: now, updatedAt: now };
  }

  private async clearRoomContents(code: string): Promise<void> {
    const rounds = await getDocs(collection(this.firestore, `rooms/${code}/rounds`));
    for (const round of rounds.docs) {
      const songs = await getDocs(collection(this.firestore, `rooms/${code}/rounds/${round.id}/songs`));
      const cards = await getDocs(collection(this.firestore, `rooms/${code}/rounds/${round.id}/cards`));
      await Promise.all([...songs.docs, ...cards.docs].map((item) => deleteDoc(item.ref)));
      await deleteDoc(round.ref);
    }
    const participants = await getDocs(collection(this.firestore, `rooms/${code}/participants`));
    await Promise.all(participants.docs.map((participant) => deleteDoc(participant.ref)));
  }

  private generateCode(): string {
    const values = crypto.getRandomValues(new Uint32Array(1));
    return String(100000 + (values[0] % 900000));
  }

  private shuffle<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled;
  }

  private requireUid(): string {
    const uid = this.auth.uid();
    if (!uid) throw new Error('La identidad anónima todavía no está disponible. Recarga la aplicación.');
    return uid;
  }
}
