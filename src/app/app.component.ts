import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import {
  IonApp,
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  albumsOutline,
  arrowBackOutline,
  checkmarkCircle,
  enterOutline,
  logInOutline,
  logOutOutline,
  musicalNotes,
  peopleOutline,
  personOutline,
  refreshOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import { Unsubscribe } from 'firebase/firestore';
import {
  BingoCardDocument,
  ParticipantDocument,
  RoomDocument,
  RoomNotFoundError,
  RoomSessionService,
  RoundDocument,
  RoundSong,
  SessionRole,
} from './core/firebase/room-session.service';

interface SpotifyImage { url: string; }
interface SpotifyUserProfile { id: string; }
interface SpotifyArtist { name: string; }
interface SpotifyTrack {
  id: string;
  name: string;
  type: string;
  is_local?: boolean;
  artists: SpotifyArtist[];
  album: { images: SpotifyImage[] };
  external_urls: { spotify: string };
}
interface SpotifyPlaylistItem { item: SpotifyTrack | null; is_local?: boolean; track?: SpotifyTrack | null; }
interface SpotifyPlaylistItemsResponse { items: SpotifyPlaylistItem[]; next: string | null; }
interface SpotifyPlaylist {
  id: string;
  name: string;
  images: SpotifyImage[];
  owner: { id: string; display_name: string | null };
  items?: { total: number };
  tracks?: { total: number };
}
interface SpotifyPlaylistsResponse { items: SpotifyPlaylist[]; next: string | null; }
interface SpotifyTokenResponse { access_token: string; expires_in: number; refresh_token?: string; }

type AppMode = 'name' | 'choice' | 'host' | 'join' | 'participant';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonContent, IonButton, IonIcon, IonInput, IonSelect, IonSelectOption, IonSpinner, IonText],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly rooms = inject(RoomSessionService);
  private readonly clientId = 'abd77186596e467eb105868ffaff2b57';
  private readonly scopes = ['playlist-read-private', 'playlist-read-collaborative'];
  private readonly verifierKey = 'spotify_code_verifier';
  private readonly stateKey = 'spotify_auth_state';
  private readonly tokenKey = 'spotify_access_token';
  private readonly tokenExpiryKey = 'spotify_token_expiry';
  private readonly refreshTokenKey = 'spotify_refresh_token';
  private readonly roomCodeKey = 'bingo_room_code';
  private readonly roleKey = 'bingo_session_role';
  private readonly nameKey = 'bingo_display_name';
  private readonly bingoSize = 15;
  private refreshPromise: Promise<string> | null = null;
  private roomUnsubscribe?: Unsubscribe;
  private participantsUnsubscribe?: Unsubscribe;
  private roundUnsubscribe?: Unsubscribe;
  private songsUnsubscribe?: Unsubscribe;
  private cardUnsubscribe?: Unsubscribe;
  private observedRoundId: string | null = null;

  readonly mode = signal<AppMode>('name');
  readonly displayName = signal('');
  readonly isRoomLoading = signal(false);
  readonly joinCode = signal('');
  readonly isLoading = signal(false);
  readonly isGeneratingCard = signal(false);
  readonly isConnected = signal(false);
  readonly isGameStarted = signal(false);
  readonly portraitNoticeVisible = signal(true);
  readonly playlists = signal<SpotifyPlaylist[]>([]);
  readonly selectedPlaylistId = signal<string | null>(null);
  readonly selectedPlaylist = computed(() => this.playlists().find((playlist) => playlist.id === this.selectedPlaylistId()) ?? null);
  readonly roomCode = signal('');
  readonly room = signal<RoomDocument | null>(null);
  readonly participants = signal<ParticipantDocument[]>([]);
  readonly activeRound = signal<RoundDocument | null>(null);
  readonly activeRoundId = signal<string | null>(null);
  readonly roundSongs = signal<RoundSong[]>([]);
  readonly card = signal<BingoCardDocument | null>(null);
  readonly bingoTracks = computed(() => {
    const byId = new Map(this.roundSongs().map((song) => [song.spotifyId, song]));
    return (this.card()?.songIds ?? []).map((id) => byId.get(id)).filter((song): song is RoundSong => Boolean(song));
  });
  readonly markedTrackIds = signal<Set<string>>(new Set());
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    addIcons({ albumsOutline, arrowBackOutline, checkmarkCircle, enterOutline, logInOutline, logOutOutline, musicalNotes, peopleOutline, personOutline, refreshOutline, shieldCheckmarkOutline });
  }

  async ngOnInit(): Promise<void> {
    const storedName = localStorage.getItem(this.nameKey) ?? await this.rooms.loadDisplayName().catch(() => '');
    this.displayName.set(storedName);
    this.mode.set(storedName ? 'choice' : 'name');
    await this.restoreSession();

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const returnedState = params.get('state');
    const spotifyError = params.get('error');
    if (spotifyError) {
      this.errorMessage.set('Spotify canceló o rechazó la autorización.');
      this.clearCallbackParameters();
      return;
    }
    if (code) {
      this.mode.set('host');
      await this.completeAuthorization(code, returnedState);
      return;
    }
    if (this.mode() === 'host' && (sessionStorage.getItem(this.tokenKey) || localStorage.getItem(this.refreshTokenKey))) {
      try {
        await this.getValidAccessToken();
        this.isConnected.set(true);
        await this.loadPlaylists();
      } catch (error) {
        this.disconnect(false);
        this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo recuperar la sesión de Spotify.');
      }
    }
  }

  ngOnDestroy(): void { this.stopRealtimeListeners(); }

  updateDisplayName(value: string | null | undefined): void {
    this.displayName.set((value ?? '').slice(0, 40));
    this.errorMessage.set(null);
  }

  async confirmName(): Promise<void> {
    this.isRoomLoading.set(true);
    try {
      const name = await this.rooms.saveDisplayName(this.displayName());
      this.displayName.set(name);
      localStorage.setItem(this.nameKey, name);
      this.mode.set('choice');
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo guardar el nombre.');
    } finally { this.isRoomLoading.set(false); }
  }

  async chooseHost(): Promise<void> {
    this.isRoomLoading.set(true);
    this.errorMessage.set(null);
    try {
      const code = await this.rooms.createHostRoom(this.displayName());
      this.enterSession('host', code);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo crear la partida.');
    } finally { this.isRoomLoading.set(false); }
  }

  showJoin(): void { this.errorMessage.set(null); this.joinCode.set(''); this.mode.set('join'); }
  updateJoinCode(value: string | null | undefined): void { this.joinCode.set((value ?? '').replace(/\D/g, '').slice(0, 6)); this.errorMessage.set(null); }

  async joinSession(): Promise<void> {
    this.isRoomLoading.set(true);
    this.errorMessage.set(null);
    try {
      const code = await this.rooms.joinRoom(this.joinCode(), this.displayName());
      this.enterSession('participant', code);
    } catch (error) {
      this.errorMessage.set(error instanceof RoomNotFoundError ? error.message : error instanceof Error ? error.message : 'No se pudo entrar en la partida.');
    } finally { this.isRoomLoading.set(false); }
  }

  async leaveSession(): Promise<void> {
    try { await this.rooms.leaveRoom(this.roomCode()); }
    finally {
      this.stopRealtimeListeners();
      this.clearPersistedSession();
      this.roomCode.set('');
      this.resetRoundState();
      this.mode.set('choice');
    }
  }

  async closeHostSession(): Promise<void> {
    try { await this.rooms.closeHostRoom(this.roomCode()); }
    finally { await this.leaveSession(); }
  }

  backToChoice(): void { this.mode.set('choice'); this.errorMessage.set(null); }

  async regenerateRoomCode(): Promise<void> {
    this.isRoomLoading.set(true);
    try {
      await this.rooms.closeHostRoom(this.roomCode());
      this.stopRealtimeListeners();
      const code = await this.rooms.createHostRoom(this.displayName());
      this.enterSession('host', code);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo generar otro número.');
    } finally { this.isRoomLoading.set(false); }
  }

  async connectWithSpotify(): Promise<void> {
    this.errorMessage.set(null);
    const verifier = this.generateRandomString(64);
    const challenge = await this.createCodeChallenge(verifier);
    const state = this.generateRandomString(24);
    sessionStorage.setItem(this.verifierKey, verifier);
    sessionStorage.setItem(this.stateKey, state);
    const params = new URLSearchParams({ client_id: this.clientId, response_type: 'code', redirect_uri: this.getRedirectUri(), scope: this.scopes.join(' '), code_challenge_method: 'S256', code_challenge: challenge, state, show_dialog: 'true' });
    window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
  }

  selectPlaylist(playlistId: string | null): void { this.selectedPlaylistId.set(playlistId); this.errorMessage.set(null); }

  async startBingo(): Promise<void> {
    const playlist = this.selectedPlaylist();
    if (!playlist) return;
    this.isGeneratingCard.set(true);
    this.errorMessage.set(null);
    try {
      const tracks = await this.loadPlaylistTracks(playlist.id);
      const songs: RoundSong[] = tracks.map((track, position) => ({
        spotifyId: track.id,
        name: track.name,
        artist: track.artists[0]?.name ?? 'Artista desconocido',
        imageUrl: track.album.images[0]?.url ?? '',
        spotifyUrl: track.external_urls.spotify,
        position,
      }));
      await this.rooms.startRound(this.roomCode(), playlist.id, playlist.name, songs);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo iniciar la partida.');
    } finally { this.isGeneratingCard.set(false); }
  }

  async endGame(): Promise<void> {
    const roundId = this.activeRoundId();
    if (!roundId) return;
    try { await this.rooms.finishRound(this.roomCode(), roundId); }
    catch (error) { this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo terminar la partida.'); }
  }

  async toggleTrack(trackId: string): Promise<void> {
    const roundId = this.activeRoundId();
    if (!roundId || !this.card()) return;
    const next = new Set(this.markedTrackIds());
    next.has(trackId) ? next.delete(trackId) : next.add(trackId);
    this.markedTrackIds.set(next);
    try { await this.rooms.updateMarkedSongs(this.roomCode(), roundId, [...next]); }
    catch { this.errorMessage.set('No se pudo guardar la casilla.'); }
  }

  isTrackMarked(trackId: string): boolean { return this.markedTrackIds().has(trackId); }
  dismissPortraitNotice(): void { this.portraitNoticeVisible.set(false); }

  disconnect(clearError = true): void {
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.tokenExpiryKey);
    localStorage.removeItem(this.refreshTokenKey);
    sessionStorage.removeItem(this.verifierKey);
    sessionStorage.removeItem(this.stateKey);
    this.playlists.set([]);
    this.selectedPlaylistId.set(null);
    if (clearError) this.errorMessage.set(null);
    this.isConnected.set(false);
  }

  private enterSession(role: SessionRole, code: string): void {
    this.persistSession(role, code);
    this.roomCode.set(code);
    this.joinCode.set(code);
    this.mode.set(role === 'host' ? 'host' : 'participant');
    this.startRealtimeListeners(code);
  }

  private startRealtimeListeners(code: string): void {
    this.stopRealtimeListeners();
    this.roomUnsubscribe = this.rooms.watchRoom(code, (room) => {
      this.room.set(room);
      if (!room || room.status !== 'open') {
        this.errorMessage.set('La sala se ha cerrado o ha caducado.');
        this.stopRoundListeners();
        return;
      }
      if (room.currentRoundId !== this.observedRoundId) this.observeRound(code, room.currentRoundId);
    });
    if (this.mode() === 'host') {
      this.participantsUnsubscribe = this.rooms.watchParticipants(code, (participants) => this.participants.set(participants));
    }
  }

  private observeRound(code: string, roundId: string | null): void {
    this.stopRoundListeners();
    this.observedRoundId = roundId;
    this.activeRoundId.set(roundId);
    this.resetRoundState(false);
    if (!roundId) return;

    this.roundUnsubscribe = this.rooms.watchRound(code, roundId, (round) => {
      this.activeRound.set(round);
      this.isGameStarted.set(round?.status === 'active');
    });
    this.songsUnsubscribe = this.rooms.watchSongs(code, roundId, async (songs) => {
      this.roundSongs.set(songs);
      if (songs.length >= this.bingoSize && !this.card()) {
        try { await this.rooms.ensureCard(code, roundId, songs); }
        catch (error) { this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo crear el cartón.'); }
      }
    });
    this.cardUnsubscribe = this.rooms.watchCard(code, roundId, (card) => {
      this.card.set(card);
      this.markedTrackIds.set(new Set(card?.markedSongIds ?? []));
    });
  }

  private stopRealtimeListeners(): void {
    this.roomUnsubscribe?.();
    this.participantsUnsubscribe?.();
    this.roomUnsubscribe = undefined;
    this.participantsUnsubscribe = undefined;
    this.stopRoundListeners();
  }

  private stopRoundListeners(): void {
    this.roundUnsubscribe?.();
    this.songsUnsubscribe?.();
    this.cardUnsubscribe?.();
    this.roundUnsubscribe = this.songsUnsubscribe = this.cardUnsubscribe = undefined;
    this.observedRoundId = null;
  }

  private resetRoundState(clearId = true): void {
    if (clearId) this.activeRoundId.set(null);
    this.activeRound.set(null);
    this.roundSongs.set([]);
    this.card.set(null);
    this.markedTrackIds.set(new Set());
    this.isGameStarted.set(false);
    this.portraitNoticeVisible.set(true);
  }

  private async restoreSession(): Promise<void> {
    const role = localStorage.getItem(this.roleKey) as SessionRole | null;
    const code = localStorage.getItem(this.roomCodeKey) ?? '';
    if ((role === 'host' || role === 'participant') && await this.rooms.resumeRoom(code, role)) {
      this.enterSession(role, code);
    }
  }

  private persistSession(role: SessionRole, code: string): void {
    localStorage.setItem(this.roleKey, role);
    localStorage.setItem(this.roomCodeKey, code);
  }

  private clearPersistedSession(): void {
    localStorage.removeItem(this.roleKey);
    localStorage.removeItem(this.roomCodeKey);
  }

  private async loadPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    const tracks: SpotifyTrack[] = [];
    let nextUrl: string | null = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=50&additional_types=track`;
    while (nextUrl) {
      const response = await this.spotifyFetch(nextUrl);
      if (!response.ok) throw new Error(`No se pudieron cargar las canciones (${response.status}).`);
      const page = (await response.json()) as SpotifyPlaylistItemsResponse;
      for (const playlistItem of page.items) {
        const track = playlistItem.item ?? playlistItem.track ?? null;
        const isLocal = playlistItem.is_local ?? track?.is_local ?? false;
        if (track && track.type === 'track' && !isLocal && track.id && track.name && track.artists?.length && track.album?.images?.length) tracks.push(track);
      }
      nextUrl = page.next;
    }
    const unique = Array.from(new Map(tracks.map((track) => [track.id, track])).values());
    if (unique.length < this.bingoSize) throw new Error(`Esta playlist solo tiene ${unique.length} canciones válidas. Necesitas al menos ${this.bingoSize}.`);
    return unique;
  }

  private async loadPlaylists(): Promise<void> {
    this.isLoading.set(true);
    try {
      const profileResponse = await this.spotifyFetch('https://api.spotify.com/v1/me');
      if (!profileResponse.ok) throw new Error(`No se pudo cargar tu perfil de Spotify (${profileResponse.status}).`);
      const profile = (await profileResponse.json()) as SpotifyUserProfile;
      const collected: SpotifyPlaylist[] = [];
      let nextUrl: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50';
      while (nextUrl) {
        const response = await this.spotifyFetch(nextUrl);
        if (!response.ok) throw new Error(`No se pudieron cargar las playlists (${response.status}).`);
        const page = (await response.json()) as SpotifyPlaylistsResponse;
        collected.push(...page.items.filter((playlist) => playlist.owner.id === profile.id));
        nextUrl = page.next;
      }
      this.playlists.set(collected);
      if (collected.length === 1) this.selectPlaylist(collected[0].id);
    } finally { this.isLoading.set(false); }
  }

  private async completeAuthorization(code: string, returnedState: string | null): Promise<void> {
    this.isLoading.set(true);
    try {
      const expectedState = sessionStorage.getItem(this.stateKey);
      const verifier = sessionStorage.getItem(this.verifierKey);
      if (!returnedState || !expectedState || returnedState !== expectedState) throw new Error('La respuesta de Spotify no supera la validación de seguridad.');
      if (!verifier) throw new Error('No se encontró el verificador PKCE.');
      const body = new URLSearchParams({ client_id: this.clientId, grant_type: 'authorization_code', code, redirect_uri: this.getRedirectUri(), code_verifier: verifier });
      const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      if (!response.ok) throw new Error(`Spotify no pudo completar el acceso (${response.status}).`);
      this.storeTokenResponse((await response.json()) as SpotifyTokenResponse);
      this.clearCallbackParameters();
      this.isConnected.set(true);
      await this.loadPlaylists();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo conectar con Spotify.');
      this.clearCallbackParameters();
    } finally { this.isLoading.set(false); }
  }

  private async spotifyFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    let token = await this.getValidAccessToken();
    let response = await fetch(input, this.withSpotifyAuthorization(init, token));
    if (response.status === 401) {
      token = await this.refreshAccessToken();
      response = await fetch(input, this.withSpotifyAuthorization(init, token));
    }
    if (response.status === 401) { this.disconnect(false); throw new Error('Spotify ha rechazado la sesión. Conecta tu cuenta de nuevo.'); }
    return response;
  }

  private withSpotifyAuthorization(init: RequestInit, accessToken: string): RequestInit {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return { ...init, headers };
  }

  private async getValidAccessToken(): Promise<string> {
    const token = sessionStorage.getItem(this.tokenKey);
    const expiry = Number(sessionStorage.getItem(this.tokenExpiryKey));
    return token && expiry && Date.now() < expiry ? token : this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<string> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.requestRefreshedAccessToken();
    try { return await this.refreshPromise; } finally { this.refreshPromise = null; }
  }

  private async requestRefreshedAccessToken(): Promise<string> {
    const refreshToken = localStorage.getItem(this.refreshTokenKey);
    if (!refreshToken) throw new Error('La sesión de Spotify ha caducado. Conecta tu cuenta de nuevo.');
    const body = new URLSearchParams({ client_id: this.clientId, grant_type: 'refresh_token', refresh_token: refreshToken });
    const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!response.ok) { this.disconnect(false); throw new Error('Spotify no pudo renovar la sesión.'); }
    const token = (await response.json()) as SpotifyTokenResponse;
    this.storeTokenResponse(token);
    return token.access_token;
  }

  private storeTokenResponse(token: SpotifyTokenResponse): void {
    sessionStorage.setItem(this.tokenKey, token.access_token);
    sessionStorage.setItem(this.tokenExpiryKey, String(Date.now() + token.expires_in * 1000 - 60_000));
    if (token.refresh_token) localStorage.setItem(this.refreshTokenKey, token.refresh_token);
  }

  private getRedirectUri(): string {
    const local = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return local ? `http://127.0.0.1:${window.location.port || '8100'}/` : 'https://zwymobile.com/bingo_musical/';
  }

  private clearCallbackParameters(): void { window.history.replaceState({}, document.title, this.getRedirectUri()); }
  private generateRandomString(length: number): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values, (value) => possible[value % possible.length]).join('');
  }
  private async createCodeChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
}
