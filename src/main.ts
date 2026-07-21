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
}).then(() => {
  const refresh = (): void => {
    bindInviteControls();
    applyInvite();
  };
  new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true });
  window.setInterval(refresh, 500);
  refresh();
}).catch((error: unknown) => console.error(error));