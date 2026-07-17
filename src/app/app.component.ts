import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import {
  IonApp,
  IonButton,
  IonContent,
  IonIcon,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  albumsOutline,
  checkmarkCircle,
  checkmarkCircleOutline,
  logInOutline,
  logOutOutline,
  musicalNotes,
  refreshOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';

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
  album: {
    images: SpotifyImage[];
  };
  external_urls: {
    spotify: string;
  };
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
  owner: {
    id: string;
    display_name: string | null;
  };
  external_urls: {
    spotify: string;
  };
  items?: {
    total: number;
  };
  tracks?: {
    total: number;
  };
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

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    IonApp,
    IonContent,
    IonButton,
    IonIcon,
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
  private readonly clientId = 'abd77186596e467eb105868ffaff2b57';
  private readonly scopes = ['playlist-read-private', 'playlist-read-collaborative'];
  private readonly verifierKey = 'spotify_code_verifier';
  private readonly stateKey = 'spotify_auth_state';
  private readonly tokenKey = 'spotify_access_token';
  private readonly tokenExpiryKey = 'spotify_token_expiry';
  private readonly bingoSize = 15;

  readonly isLoading = signal(false);
  readonly isGeneratingCard = signal(false);
  readonly isConnected = signal(false);
  readonly playlists = signal<SpotifyPlaylist[]>([]);
  readonly selectedPlaylistId = signal<string | null>(null);
  readonly selectedPlaylist = computed(() =>
    this.playlists().find((playlist) => playlist.id === this.selectedPlaylistId()) ?? null,
  );
  readonly bingoTracks = signal<SpotifyTrack[]>([]);
  readonly markedTrackIds = signal<Set<string>>(new Set());
  readonly markedCount = computed(() => this.markedTrackIds().size);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    addIcons({
      albumsOutline,
      checkmarkCircle,
      checkmarkCircleOutline,
      musicalNotes,
      logInOutline,
      logOutOutline,
      refreshOutline,
      shieldCheckmarkOutline,
    });
  }

  async ngOnInit(): Promise<void> {
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
      await this.completeAuthorization(code, returnedState);
      return;
    }

    if (this.hasValidAccessToken()) {
      this.isConnected.set(true);
      await this.loadPlaylists();
    }
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
    });

    window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
  }

  async selectPlaylist(playlistId: string | null): Promise<void> {
    this.selectedPlaylistId.set(playlistId);
    this.bingoTracks.set([]);
    this.markedTrackIds.set(new Set());
    this.errorMessage.set(null);

    if (playlistId) {
      await this.generateBingoCard();
    }
  }

  async generateBingoCard(): Promise<void> {
    const playlistId = this.selectedPlaylistId();
    const accessToken = sessionStorage.getItem(this.tokenKey);

    if (!playlistId || !accessToken) {
      return;
    }

    this.isGeneratingCard.set(true);
    this.errorMessage.set(null);
    this.markedTrackIds.set(new Set());

    try {
      const tracks: SpotifyTrack[] = [];
      let nextUrl: string | null =
        `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items` +
        '?limit=50&additional_types=track';

      while (nextUrl) {
        const response = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (response.status === 401) {
          this.disconnect();
          throw new Error('La sesión de Spotify ha caducado. Conecta tu cuenta de nuevo.');
        }

        if (!response.ok) {
          throw new Error(`No se pudieron cargar las canciones (${response.status}).`);
        }

        const page = (await response.json()) as SpotifyPlaylistItemsResponse;

        for (const playlistItem of page.items) {
          const track = playlistItem.item ?? playlistItem.track ?? null;
          const isLocal = playlistItem.is_local ?? track?.is_local ?? false;

          if (
            track &&
            track.type === 'track' &&
            !isLocal &&
            track.id &&
            track.name &&
            track.artists?.length &&
            track.album?.images?.length
          ) {
            tracks.push(track);
          }
        }

        nextUrl = page.next;
      }

      const uniqueTracks = Array.from(new Map(tracks.map((track) => [track.id, track])).values());

      if (uniqueTracks.length < this.bingoSize) {
        throw new Error(
          `Esta playlist solo tiene ${uniqueTracks.length} canciones válidas. Necesitas al menos ${this.bingoSize}.`,
        );
      }

      this.bingoTracks.set(this.shuffle(uniqueTracks).slice(0, this.bingoSize));
    } catch (error) {
      this.bingoTracks.set([]);
      this.errorMessage.set(
        error instanceof Error ? error.message : 'No se pudo generar el cartón.',
      );
    } finally {
      this.isGeneratingCard.set(false);
    }
  }

  toggleTrack(trackId: string): void {
    const nextMarked = new Set(this.markedTrackIds());

    if (nextMarked.has(trackId)) {
      nextMarked.delete(trackId);
    } else {
      nextMarked.add(trackId);
    }

    this.markedTrackIds.set(nextMarked);
  }

  isTrackMarked(trackId: string): boolean {
    return this.markedTrackIds().has(trackId);
  }

  disconnect(): void {
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.tokenExpiryKey);
    sessionStorage.removeItem(this.verifierKey);
    sessionStorage.removeItem(this.stateKey);
    this.playlists.set([]);
    this.selectedPlaylistId.set(null);
    this.bingoTracks.set([]);
    this.markedTrackIds.set(new Set());
    this.errorMessage.set(null);
    this.isConnected.set(false);
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

      if (!verifier) {
        throw new Error('No se encontró el verificador PKCE. Vuelve a iniciar la conexión.');
      }

      const body = new URLSearchParams({
        client_id: this.clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.getRedirectUri(),
        code_verifier: verifier,
      });

      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`Spotify no pudo completar el acceso (${response.status}).`);
      }

      const token = (await response.json()) as SpotifyTokenResponse;
      sessionStorage.setItem(this.tokenKey, token.access_token);
      sessionStorage.setItem(
        this.tokenExpiryKey,
        String(Date.now() + token.expires_in * 1000 - 30_000),
      );
      sessionStorage.removeItem(this.verifierKey);
      sessionStorage.removeItem(this.stateKey);

      this.clearCallbackParameters();
      this.isConnected.set(true);
      await this.loadPlaylists();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'No se pudo conectar con Spotify.',
      );
      this.clearCallbackParameters();
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadPlaylists(): Promise<void> {
    const accessToken = sessionStorage.getItem(this.tokenKey);

    if (!accessToken) {
      this.isConnected.set(false);
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const profileResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (profileResponse.status === 401) {
        this.disconnect();
        throw new Error('La sesión de Spotify ha caducado. Conecta tu cuenta de nuevo.');
      }

      if (!profileResponse.ok) {
        throw new Error(`No se pudo cargar tu perfil de Spotify (${profileResponse.status}).`);
      }

      const profile = (await profileResponse.json()) as SpotifyUserProfile;
      const collected: SpotifyPlaylist[] = [];
      let nextUrl: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50';

      while (nextUrl) {
        const response = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (response.status === 401) {
          this.disconnect();
          throw new Error('La sesión de Spotify ha caducado. Conecta tu cuenta de nuevo.');
        }

        if (!response.ok) {
          throw new Error(`No se pudieron cargar las playlists (${response.status}).`);
        }

        const page = (await response.json()) as SpotifyPlaylistsResponse;
        collected.push(...page.items.filter((playlist) => playlist.owner.id === profile.id));
        nextUrl = page.next;
      }

      this.playlists.set(collected);

      if (collected.length === 1) {
        await this.selectPlaylist(collected[0].id);
      } else if (!collected.some((playlist) => playlist.id === this.selectedPlaylistId())) {
        this.selectedPlaylistId.set(null);
      }
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'No se pudieron cargar tus playlists.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  private shuffle<T>(items: T[]): T[] {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }

    return shuffled;
  }

  private hasValidAccessToken(): boolean {
    const token = sessionStorage.getItem(this.tokenKey);
    const expiry = Number(sessionStorage.getItem(this.tokenExpiryKey));
    return Boolean(token && expiry && Date.now() < expiry);
  }

  private getRedirectUri(): string {
    const isLocalhost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isLocalhost) {
      return `http://127.0.0.1:${window.location.port || '8100'}/`;
    }

    return 'https://zwymobile.com/bingo_musical/';
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
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(verifier),
    );

    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }
}
