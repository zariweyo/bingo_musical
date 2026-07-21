import { inject, provideAppInitializer } from '@angular/core';
import { provideFirebaseApp } from '@angular/fire/app';
import { provideAuth } from '@angular/fire/auth';
import { provideFirestore } from '@angular/fire/firestore';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { AppComponent } from './app/app.component';
import { AnonymousAuthService } from './app/core/firebase/anonymous-auth.service';
import { RoomSessionService } from './app/core/firebase/room-session.service';
import { firebaseConfig } from './environments/firebase.config';

const invitedRoomCode = (new URLSearchParams(window.location.search).get('room') ?? '')
  .replace(/\D/g, '')
  .slice(0, 6);
let inviteApplied = false;

const copyText = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

const invitationUrl = (roomCode: string): string => {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', roomCode);
  return url.toString();
};

const roomCodeForElement = (element: HTMLElement): string => {
  const source = element.dataset['roomCode'] ?? element.textContent ?? '';
  return source.replace(/\D/g, '').slice(0, 6);
};

const shareRoom = async (element: HTMLElement): Promise<void> => {
  const roomCode = roomCodeForElement(element);
  if (roomCode.length !== 6) return;

  const url = invitationUrl(roomCode);
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Bingo Musical',
        text: `Únete a mi partida de Bingo Musical. Sala ${roomCode}.`,
        url,
      });
      return;
    }

    await copyText(url);
    const originalText = element.textContent;
    element.textContent = 'Enlace copiado';
    window.setTimeout(() => { element.textContent = originalText; }, 1800);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    await copyText(url).catch(() => undefined);
  }
};

const bindInviteControls = (): void => {
  document.querySelectorAll<HTMLElement>('.share-room-button, .header-room-code').forEach((element) => {
    if (element.dataset['shareBound'] === 'true') return;
    element.dataset['shareBound'] = 'true';

    if (element.classList.contains('header-room-code')) {
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      element.setAttribute('aria-label', `${element.textContent?.trim() ?? 'Sala'}. Compartir invitación`);
      element.style.cursor = 'pointer';
    }

    element.addEventListener('click', () => void shareRoom(element));
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      void shareRoom(element);
    });
  });
};

const clearHostSession = (): void => {
  localStorage.removeItem('bingo_session_role');
  localStorage.removeItem('bingo_room_code');
  localStorage.removeItem('spotify_refresh_token');
  for (const key of [
    'spotify_access_token',
    'spotify_token_expiry',
    'spotify_code_verifier',
    'spotify_auth_state',
  ]) {
    sessionStorage.removeItem(key);
  }
};

const bindLeaveHostControl = (rooms: RoomSessionService): void => {
  const header = document.querySelector<HTMLElement>('.playlists-header');
  if (!header || header.querySelector('.leave-host-button')) return;

  const spotifyButton = Array.from(header.querySelectorAll<HTMLElement>('ion-button'))
    .find((button) => button.textContent?.includes('Desconectar Spotify'));
  if (!spotifyButton) return;

  const button = document.createElement('ion-button');
  button.className = 'leave-host-button';
  button.setAttribute('fill', 'clear');
  button.textContent = 'Dejar de ser anfitrión';
  spotifyButton.insertAdjacentElement('beforebegin', button);

  button.addEventListener('click', async () => {
    if (!window.confirm('¿Quieres dejar de ser anfitrión? La sala actual se cerrará.')) return;

    button.setAttribute('disabled', 'true');
    button.textContent = 'Cerrando sala…';
    const roomCode = (localStorage.getItem('bingo_room_code') ?? '').replace(/\D/g, '').slice(0, 6);

    try {
      if (roomCode.length === 6) {
        await rooms.closeHostRoom(roomCode);
        await rooms.leaveRoom(roomCode).catch(() => undefined);
      }
    } finally {
      clearHostSession();
      window.location.reload();
    }
  });
};

const applyInvite = (): void => {
  if (inviteApplied || invitedRoomCode.length !== 6) return;
  const joinInput = document.getElementById('join-room-input') as (HTMLElement & { value?: string }) | null;
  if (joinInput) {
    joinInput.value = invitedRoomCode;
    joinInput.dispatchEvent(new CustomEvent('ionInput', {
      bubbles: true,
      detail: { value: invitedRoomCode },
    }));
    inviteApplied = true;
    return;
  }
  document.getElementById('join-role-button')?.click();
};

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular(),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideAppInitializer(() => inject(AnonymousAuthService).initialize()),
  ],
}).then((appRef) => {
  const rooms = appRef.injector.get(RoomSessionService);
  const refresh = (): void => {
    bindInviteControls();
    bindLeaveHostControl(rooms);
    applyInvite();
  };
  new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true });
  window.setInterval(refresh, 500);
  refresh();
}).catch((error: unknown) => console.error(error));