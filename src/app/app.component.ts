import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
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
  checkmarkCircleOutline,
  enterOutline,
  logInOutline,
  logOutOutline,
  musicalNotes,
  peopleOutline,
  personOutline,
  refreshOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import { RoomNotFoundError, RoomSessionService } from './core/firebase/room-session.service';

interface SpotifyImage {
  url: string;
}

interface SpotifyUserProfile {
  id: string;
}

interface SpotifyArtist {
  name: string;
}

interface SpotifyTrack {
  id: string;
  name: string;
  type: string;
  is_local?: boolean;
  artists: SpotifyArtist[];
  album: { images: SpotifyImage[] };
  external_urls: { spotify: string };
}

interface SpotifyPlaylistItem {
  item: SpotifyTrack | null;
  is_local?: boolean;
  track?: SpotifyTrack | null;
}

interface SpotifyPlaylistItemsResponse {
  items: SpotifyPlaylistItem[];
  next: string | null;
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  images: SpotifyImage[];
  owner: { id: string; display_name: string | null };
  external_urls: { spotify: string };
  items?: { total: number };
  tracks?: { total: number };
}

interface SpotifyPlaylistsResponse {
  items: SpotifyPlaylist[];
  next: string | null;
}

interface SpotifyTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

type AppMode = 'choice' | 'host' | 'join' | 'participant';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    IonApp,
    IonContent,
    IonButton,
    IonIcon,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonText,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
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
  private readonly bingoSize = 15;
  private refreshPromise: Promise<string> | null = null;

  readonly mode = signal<AppMode>('choice');
  readonly isRoomLoading = signal(false);
  readonly joinCode = signal('');
  readonly isLoading = signal(false);
  readonly isGeneratingCard = signal(false);
  readonly isConnected = signal(false);
  readonly isGameStarted = signal(false);
  readonly portraitNoticeVisible = signal(true);
  readonly playlists = signal<SpotifyPlaylist[]>([]);
  readonly selectedPlaylistId = signal<string | null>(null);
  readonly selectedPlaylist = computed(() =>
    this.playlists().find((playlist) => playlist.id === this.selectedPlaylistId()) ?? null,
  );
  readonly roomCode = signal('');
  readonly bingoTracks = signal<SpotifyTrack[]>([]);
  readonly markedTrackIds = signal<Set<string>>(new Set());
  readonly markedCount = computed(() => this.markedTrackIds().size);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    addIcons({
      albumsOutline,
      arrowBackOutline,
      checkmarkCircle,
      checkmarkCircleOutline,
      enterOutline,
      logInOutline,
      logOutOutline,
      musicalNotes,
      peopleOutline,
      personOutline,
      refreshOutline,
      shieldCheckmarkOutline,
    });
  }

  async ngOnInit(): Promise<void> {
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
        this.errorMessage.set(
          error instanceof Error ? error.message : 'No se pudo recuperar la sesión de Spotify.',
        );
      }
    }
  }

  async chooseHost(): Promise<void> {
    this.isRoomLoading.set(true);
    this.errorMessage.set(null);

    try {
      const code = await this.rooms.createHostRoom();
      this.persistSession('host', code);
      this.roomCode.set(code);
      this.mode.set('host');
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo crear la partida.');
    } finally {
      this.isRoomLoading.set(false);
    }
  }

  showJoin(): void {
    this.errorMessage.set(null);
    this.joinCode.set('');
    this.mode.set('join');
  }

  updateJoinCode(value: string | null | undefined): void {
    this.joinCode.set((value ?? '').replace(/\D/g, '').slice(0, 6));
    this.errorMessage.set(null);
  }

  async joinSession(): Promise<void> {
    this.isRoomLoading.set(true);
    this.errorMessage.set(null);

    try {
      const code = await this.rooms.joinRoom(this.joinCode());
      this.persistSession('participant', code);
      this.roomCode.set(code);
      this.mode.set('participant');
    } catch (error) {
      this.errorMessage.set(
        error instanceof RoomNotFoundError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'No se pudo entrar en la partida.',
      );
    } finally {
      this.isRoomLoading.set(false);
    }
  }

  async leaveSession(): Promise<void> {
    const currentMode = this.mode();
    const code = this.roomCode();

    try {
      if (currentMode === 'participant') {
        await this.rooms.leaveRoom(code);
      } else if (currentMode === 'host') {
        await this.rooms.closeHostRoom(code);
      }
    } finally {
      this.clearPersistedSession();
      this.roomCode.set('');
      this.joinCode.set('');
      this.isGameStarted.set(false);
      this.mode.set('choice');
      this.errorMessage.set(null);
    }
  }

  backToChoice(): void {
    this.mode.set('choice');
    this.errorMessage.set(null);
  }

  async connectWithSpotify(): Promise<void> {
    this.errorMessage.set(null);
    const verifier = this.generateRandomString(64);
    const challenge = await this.createCodeChallenge(verifier);
    const state = this.generateRandomString(24);

    sessionStorage.setItem(this.verifierKey, verifier);
    sessionStorage.setItem(this.stateKey, state);

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.getRedirectUri(),
      scope: this.scopes.join(' '),
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
      show_dialog: 'true',
    });

    window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
  }

  selectPlaylist(playlistId: string | null): void {
    this.selectedPlaylistId.set(playlistId);
    this.bingoTracks.set([]);
    this.markedTrackIds.set(new Set());
    this.errorMessage.set(null);
  }

  async regenerateRoomCode(): Promise<void> {
    this.isRoomLoading.set(true);
    this.errorMessage.set(null);

    try {
      await this.rooms.closeHostRoom(this.roomCode());
      const code = await this.rooms.createHostRoom();
      this.persistSession('host', code);
      this.roomCode.set(code);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo generar otro número.');
    } finally {
      this.isRoomLoading.set(false);
    }
  }

  async startBingo(): Promise<void> {
    const generated = await this.generateBingoCard();
    if (generated) {
      this.portraitNoticeVisible.set(true);
      this.isGameStarted.set(true);
    }
  }

  endGame(): void {
    this.isGameStarted.set(false);
    this.bingoTracks.set([]);
    this.markedTrackIds.set(new Set());
    this.portraitNoticeVisible.set(true);
  }

  dismissPortraitNotice(): void {
    this.portraitNoticeVisible.set(false);
  }

  async generateBingoCard(): Promise<boolean> {
    const playlistId = this.selectedPlaylistId();
    if (!playlistId) return false;

    this.isGeneratingCard.set(true);
    this.errorMessage.set(null);
    this.markedTrackIds.set(new Set());

    try {
      const tracks: SpotifyTrack[] = [];
      let nextUrl: string | null =
        `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items` +
        '?limit=50&additional_types=track';

      while (nextUrl) {
        const response = await this.spotifyFetch(nextUrl);
        if (!response.ok) throw new Error(`No se pudieron cargar las canciones (${response.status}).`);

        const page = (await response.json()) as SpotifyPlaylistItemsResponse;
        for (const playlistItem of page.items) {
          const track = playlistItem.item ?? playlistItem.track ?? null;
          const isLocal = playlistItem.is_local ?? track?.is_local ?? false;
          if (
            track && track.type === 'track' && !isLocal && track.id && track.name &&
            track.artists?.length && track.album?.images?.length
          ) {
            tracks.push(track);
          }
        }
        nextUrl = page.next;
      }

      const uniqueTracks = Array.from(new Map(tracks.map((track) => [track.id, track])).values());
      if (uniqueTracks.length < this.bingoSize) {
        throw new Error(`Esta playlist solo tiene ${uniqueTracks.length} canciones válidas. Necesitas al menos ${this.bingoSize}.`);
      }

      this.bingoTracks.set(this.shuffle(uniqueTracks).slice(0, this.bingoSize));
      return true;
    } catch (error) {
      this.bingoTracks.set([]);
      this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo generar el cartón.');
      return false;
    } finally {
      this.isGeneratingCard.set(false);
    }
  }

  toggleTrack(trackId: string): void {
    const nextMarked = new Set(this.markedTrackIds());
    nextMarked.has(trackId) ? nextMarked.delete(trackId) : nextMarked.add(trackId);
    this.markedTrackIds.set(nextMarked);
  }

  isTrackMarked(trackId: string): boolean {
    return this.markedTrackIds().has(trackId);
  }

  disconnect(clearError = true): void {
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.tokenExpiryKey);
    localStorage.removeItem(this.refreshTokenKey);
    sessionStorage.removeItem(this.verifierKey);
    sessionStorage.removeItem(this.stateKey);
    this.playlists.set([]);
    this.selectedPlaylistId.set(null);
    this.bingoTracks.set([]);
    this.markedTrackIds.set(new Set());
    if (clearError) this.errorMessage.set(null);
    this.isGameStarted.set(false);
    this.isConnected.set(false);
  }

  private async restoreSession(): Promise<void> {
    const role = localStorage.getItem(this.roleKey);
    const code = localStorage.getItem(this.roomCodeKey) ?? '';

    if (role === 'host' && (await this.rooms.resumeHostRoom(code))) {
      this.roomCode.set(code);
      this.mode.set('host');
      return;
    }

    if (role === 'participant') {
      try {
        const joinedCode = await this.rooms.joinRoom(code);
        this.roomCode.set(joinedCode);
        this.joinCode.set(joinedCode);
        this.mode.set('participant');
        return;
      } catch {
        // The room no longer exists or has expired; return to role selection.
      }
    }

    this.clearPersistedSession();
  }

  private persistSession(role: 'host' | 'participant', code: string): void {
    localStorage.setItem(this.roleKey, role);
    localStorage.setItem(this.roomCodeKey, code);
  }

  private clearPersistedSession(): void {
    localStorage.removeItem(this.roleKey);
    localStorage.removeItem(this.roomCodeKey);
  }

  private async completeAuthorization(code: string, returnedState: string | null): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const expectedState = sessionStorage.getItem(this.stateKey);
      const verifier = sessionStorage.getItem(this.verifierKey);
      if (!returnedState || !expectedState || returnedState !== expectedState) {
        throw new Error('La respuesta de Spotify no supera la validación de seguridad.');
      }
      if (!verifier) throw new Error('No se encontró el verificador PKCE. Vuelve a iniciar la conexión.');

      const body = new URLSearchParams({
        client_id: this.clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.getRedirectUri(),
        code_verifier: verifier,
      });
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!response.ok) throw new Error(`Spotify no pudo completar el acceso (${response.status}).`);

      this.storeTokenResponse((await response.json()) as SpotifyTokenResponse);
      sessionStorage.removeItem(this.verifierKey);
      sessionStorage.removeItem(this.stateKey);
      this.clearCallbackParameters();
      this.isConnected.set(true);
      await this.loadPlaylists();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo conectar con Spotify.');
      this.clearCallbackParameters();
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadPlaylists(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

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
      if (collected.length === 1) {
        this.selectPlaylist(collected[0].id);
      } else if (!collected.some((playlist) => playlist.id === this.selectedPlaylistId())) {
        this.selectedPlaylistId.set(null);
      }
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No se pudieron cargar tus playlists.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async spotifyFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    let accessToken = await this.getValidAccessToken();
    let response = await fetch(input, this.withSpotifyAuthorization(init, accessToken));
    if (response.status === 401) {
      accessToken = await this.refreshAccessToken();
      response = await fetch(input, this.withSpotifyAuthorization(init, accessToken));
    }
    if (response.status === 401) {
      this.disconnect(false);
      throw new Error('Spotify ha rechazado la sesión. Conecta tu cuenta de nuevo.');
    }
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
    if (token && expiry && Date.now() < expiry) return token;
    return this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<string> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.requestRefreshedAccessToken();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async requestRefreshedAccessToken(): Promise<string> {
    const refreshToken = localStorage.getItem(this.refreshTokenKey);
    if (!refreshToken) throw new Error('La sesión de Spotify ha caducado. Conecta tu cuenta de nuevo.');

    const body = new URLSearchParams({
      client_id: this.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      this.disconnect(false);
      throw new Error('Spotify no pudo renovar la sesión. Conecta tu cuenta de nuevo.');
    }

    const token = (await response.json()) as SpotifyTokenResponse;
    this.storeTokenResponse(token);
    this.isConnected.set(true);
    return token.access_token;
  }

  private storeTokenResponse(token: SpotifyTokenResponse): void {
    sessionStorage.setItem(this.tokenKey, token.access_token);
    sessionStorage.setItem(this.tokenExpiryKey, String(Date.now() + token.expires_in * 1000 - 60_000));
    if (token.refresh_token) localStorage.setItem(this.refreshTokenKey, token.refresh_token);
  }

  private shuffle<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled;
  }

  private getRedirectUri(): string {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocalhost
      ? `http://127.0.0.1:${window.location.port || '8100'}/`
      : 'https://zwymobile.com/bingo_musical/';
  }

  private clearCallbackParameters(): void {
    window.history.replaceState({}, document.title, this.getRedirectUri());
  }

  private generateRandomString(length: number): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values, (value) => possible[value % possible.length]).join('');
  }

  private async createCodeChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }
}
