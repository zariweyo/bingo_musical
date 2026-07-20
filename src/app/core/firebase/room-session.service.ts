import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { Timestamp, Unsubscribe, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, runTransaction, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { AnonymousAuthService } from './anonymous-auth.service';

export type SessionRole = 'host' | 'participant';
export type RoomStatus = 'open' | 'closed' | 'resetting';
export type RoundStatus = 'preparing' | 'active' | 'finished';

export interface UserProfile { userId: string; displayName: string; createdAt: Timestamp; updatedAt: Timestamp; }
export interface RoomDocument { hostId: string; code: string; status: RoomStatus; createdAt: Timestamp; updatedAt: Timestamp; expiresAt: Timestamp; currentRoundId: string | null; playlistId: string | null; playlistName: string | null; }
export interface ParticipantDocument { userId: string; displayName: string; role: SessionRole; active: boolean; joinedAt: Timestamp; updatedAt: Timestamp; }
export interface RoundDocument { status: RoundStatus; playlistId: string; playlistName: string; createdAt: Timestamp; startedAt: Timestamp | null; finishedAt: Timestamp | null; }
export interface RoundSong { spotifyId: string; name: string; artist: string; imageUrl: string; spotifyUrl: string; position: number; }
export interface PlayedSongDocument extends RoundSong { playedAt: Timestamp; playedBy: string; sequence: number; source: 'spotify' | 'manual'; }
export interface BingoCardDocument { userId: string; roundId: string; songIds: string[]; markedSongIds: string[]; lineClaimedAt: Timestamp | null; bingoClaimedAt: Timestamp | null; createdAt: Timestamp; updatedAt: Timestamp; }

export class RoomNotFoundError extends Error { constructor() { super('La partida no existe o ya ha caducado.'); } }

@Injectable({ providedIn: 'root' })
export class RoomSessionService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AnonymousAuthService);
  private readonly ttlMs = 2 * 60 * 60 * 1000;
  private readonly cardSize = 15;

  async saveDisplayName(rawName: string): Promise<string> {
    const displayName = rawName.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (displayName.length < 2) throw new Error('Escribe un nombre de al menos dos caracteres.');
    const uid = this.requireUid(); const ref = doc(this.firestore, `users/${uid}`); const snap = await getDoc(ref); const now = Timestamp.now();
    await setDoc(ref, { userId: uid, displayName, createdAt: snap.exists() ? snap.data()['createdAt'] ?? now : now, updatedAt: now }, { merge: true });
    return displayName;
  }
  async loadDisplayName(): Promise<string> { const snap = await getDoc(doc(this.firestore, `users/${this.requireUid()}`)); return snap.exists() ? String(snap.data()['displayName'] ?? '') : ''; }

  async createHostRoom(displayName: string): Promise<string> {
    const uid = this.requireUid();
    for (let i = 0; i < 30; i++) {
      const code = String(Math.floor(100000 + Math.random() * 900000)); const roomRef = doc(this.firestore, `rooms/${code}`); const now = Timestamp.now(); const expiresAt = Timestamp.fromMillis(now.toMillis() + this.ttlMs);
      const claimed = await runTransaction(this.firestore, async tx => { const snap = await tx.get(roomRef); if (snap.exists() && snap.data()['expiresAt'] instanceof Timestamp && snap.data()['expiresAt'].toMillis() > Date.now()) return false; tx.set(roomRef, { hostId: uid, code, status: 'open', createdAt: now, updatedAt: now, expiresAt, currentRoundId: null, playlistId: null, playlistName: null }); return true; });
      if (claimed) { await this.clearRoomContents(code); await setDoc(doc(this.firestore, `rooms/${code}/participants/${uid}`), this.participant(uid, displayName, 'host')); return code; }
    }
    throw new Error('No se pudo reservar un número de partida.');
  }

  async resumeRoom(code: string, role: SessionRole): Promise<boolean> {
    if (!/^\d{6}$/.test(code)) return false; const uid = this.requireUid(); const roomSnap = await getDoc(doc(this.firestore, `rooms/${code}`)); const participantSnap = await getDoc(doc(this.firestore, `rooms/${code}/participants/${uid}`));
    if (!roomSnap.exists() || !participantSnap.exists()) return false; const room = roomSnap.data() as RoomDocument; const valid = room.status === 'open' && room.expiresAt.toMillis() > Date.now(); const correct = role === 'host' ? room.hostId === uid : participantSnap.data()['role'] === 'participant';
    if (!valid || !correct) return false; await updateDoc(participantSnap.ref, { active: true, updatedAt: Timestamp.now() }); return true;
  }

  async joinRoom(rawCode: string, displayName: string): Promise<string> {
    const code = rawCode.replace(/\D/g, '').slice(0, 6); if (!/^\d{6}$/.test(code)) throw new RoomNotFoundError(); const uid = this.requireUid(); const roomRef = doc(this.firestore, `rooms/${code}`);
    await runTransaction(this.firestore, async tx => { const snap = await tx.get(roomRef); if (!snap.exists()) throw new RoomNotFoundError(); const room = snap.data() as RoomDocument; if (room.status !== 'open' || room.expiresAt.toMillis() <= Date.now()) throw new RoomNotFoundError(); tx.set(doc(this.firestore, `rooms/${code}/participants/${uid}`), this.participant(uid, displayName, room.hostId === uid ? 'host' : 'participant'), { merge: true }); }); return code;
  }

  watchRoom(code: string, cb: (value: RoomDocument | null) => void): Unsubscribe { return onSnapshot(doc(this.firestore, `rooms/${code}`), s => cb(s.exists() ? s.data() as RoomDocument : null)); }
  watchParticipants(code: string, cb: (value: ParticipantDocument[]) => void): Unsubscribe { return onSnapshot(collection(this.firestore, `rooms/${code}/participants`), s => cb(s.docs.map(d => d.data() as ParticipantDocument))); }
  watchRound(code: string, roundId: string, cb: (value: RoundDocument | null) => void): Unsubscribe { return onSnapshot(doc(this.firestore, `rooms/${code}/rounds/${roundId}`), s => cb(s.exists() ? s.data() as RoundDocument : null)); }
  watchSongs(code: string, roundId: string, cb: (value: RoundSong[]) => void): Unsubscribe { return onSnapshot(collection(this.firestore, `rooms/${code}/rounds/${roundId}/songs`), s => cb(s.docs.map(d => d.data() as RoundSong).sort((a,b) => a.position-b.position))); }
  watchPlayedSongs(code: string, roundId: string, cb: (value: PlayedSongDocument[]) => void): Unsubscribe { return onSnapshot(collection(this.firestore, `rooms/${code}/rounds/${roundId}/playedSongs`), s => cb(s.docs.map(d => d.data() as PlayedSongDocument).sort((a,b) => a.sequence-b.sequence))); }
  watchCard(code: string, roundId: string, cb: (value: BingoCardDocument | null) => void): Unsubscribe { const uid = this.requireUid(); return onSnapshot(doc(this.firestore, `rooms/${code}/rounds/${roundId}/cards/${uid}`), s => cb(s.exists() ? s.data() as BingoCardDocument : null)); }

  async startRound(code: string, playlistId: string, playlistName: string, songs: RoundSong[]): Promise<string> {
    if (songs.length < this.cardSize) throw new Error(`La ronda necesita al menos ${this.cardSize} canciones.`); const uid = this.requireUid(); const roomRef = doc(this.firestore, `rooms/${code}`); const roundRef = doc(collection(this.firestore, `rooms/${code}/rounds`)); const now = Timestamp.now();
    await runTransaction(this.firestore, async tx => { const snap = await tx.get(roomRef); if (!snap.exists() || snap.data()['hostId'] !== uid) throw new Error('Solo el anfitrión puede iniciar la partida.'); if (snap.data()['currentRoundId']) throw new Error('Ya hay una ronda activa.'); tx.set(roundRef, { status:'preparing', playlistId, playlistName, createdAt:now, startedAt:null, finishedAt:null }); });
    for (let offset=0; offset<songs.length; offset+=400) { const batch=writeBatch(this.firestore); for (const song of songs.slice(offset,offset+400)) batch.set(doc(this.firestore, `rooms/${code}/rounds/${roundRef.id}/songs/${song.spotifyId}`), song); await batch.commit(); }
    const startedAt=Timestamp.now(); const batch=writeBatch(this.firestore); batch.update(roundRef,{status:'active',startedAt}); batch.update(roomRef,{currentRoundId:roundRef.id,playlistId,playlistName,updatedAt:startedAt,expiresAt:Timestamp.fromMillis(startedAt.toMillis()+this.ttlMs)}); await batch.commit(); return roundRef.id;
  }

  async markSongPlayed(code: string, roundId: string, song: RoundSong, source: 'spotify'|'manual'): Promise<void> {
    const uid=this.requireUid(); const roomRef=doc(this.firestore,`rooms/${code}`); const playedRef=doc(this.firestore,`rooms/${code}/rounds/${roundId}/playedSongs/${song.spotifyId}`);
    await runTransaction(this.firestore, async tx => { const room=await tx.get(roomRef); if (!room.exists() || room.data()['hostId']!==uid) throw new Error('Solo el anfitrión puede registrar canciones.'); const existing=await tx.get(playedRef); if (existing.exists()) return; const playedCollection=collection(this.firestore,`rooms/${code}/rounds/${roundId}/playedSongs`); const all=await getDocs(playedCollection); tx.set(playedRef,{...song,playedAt:Timestamp.now(),playedBy:uid,sequence:all.size,source}); });
  }

  async finishRound(code:string,roundId:string):Promise<void>{const uid=this.requireUid();const roomRef=doc(this.firestore,`rooms/${code}`);await runTransaction(this.firestore,async tx=>{const room=await tx.get(roomRef);if(!room.exists()||room.data()['hostId']!==uid)throw new Error('Solo el anfitrión puede terminar la partida.');const now=Timestamp.now();tx.update(doc(this.firestore,`rooms/${code}/rounds/${roundId}`),{status:'finished',finishedAt:now});tx.update(roomRef,{currentRoundId:null,updatedAt:now});});}
  async ensureCard(code:string,roundId:string,songs:RoundSong[]):Promise<BingoCardDocument>{if(songs.length<this.cardSize)throw new Error('Todavía se están cargando las canciones.');const uid=this.requireUid();const ref=doc(this.firestore,`rooms/${code}/rounds/${roundId}/cards/${uid}`);return runTransaction(this.firestore,async tx=>{const snap=await tx.get(ref);if(snap.exists())return snap.data() as BingoCardDocument;const now=Timestamp.now();const card={userId:uid,roundId,songIds:this.shuffle(songs.map(s=>s.spotifyId)).slice(0,this.cardSize),markedSongIds:[],lineClaimedAt:null,bingoClaimedAt:null,createdAt:now,updatedAt:now};tx.set(ref,card);return card;});}
  async updateMarkedSongs(code:string,roundId:string,ids:string[]):Promise<void>{await updateDoc(doc(this.firestore,`rooms/${code}/rounds/${roundId}/cards/${this.requireUid()}`),{markedSongIds:ids,updatedAt:Timestamp.now()});}
  async leaveRoom(code:string):Promise<void>{const ref=doc(this.firestore,`rooms/${code}/participants/${this.requireUid()}`);if((await getDoc(ref)).exists())await updateDoc(ref,{active:false,updatedAt:Timestamp.now()});}
  async closeHostRoom(code:string):Promise<void>{const ref=doc(this.firestore,`rooms/${code}`);const snap=await getDoc(ref);if(snap.exists()&&snap.data()['hostId']===this.requireUid())await updateDoc(ref,{status:'closed',currentRoundId:null,updatedAt:Timestamp.now(),expiresAt:Timestamp.now()});}

  private participant(uid:string,displayName:string,role:SessionRole):ParticipantDocument{const now=Timestamp.now();return{userId:uid,displayName:displayName.trim().slice(0,40),role,active:true,joinedAt:now,updatedAt:now};}
  private requireUid():string{const uid=this.auth.currentUser()?.uid;if(!uid)throw new Error('No se pudo identificar al usuario.');return uid;}
  private shuffle<T>(items:T[]):T[]{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
  private async clearRoomContents(code:string):Promise<void>{const rounds=await getDocs(collection(this.firestore,`rooms/${code}/rounds`));for(const round of rounds.docs){for(const name of ['songs','cards','playedSongs']){const docs=await getDocs(collection(this.firestore,`${round.ref.path}/${name}`));for(const item of docs.docs)await deleteDoc(item.ref);}await deleteDoc(round.ref);}const participants=await getDocs(collection(this.firestore,`rooms/${code}/participants`));for(const item of participants.docs)await deleteDoc(item.ref);}
}
