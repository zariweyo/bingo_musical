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

const bindInviteControls = (): void => {
  document.querySelectorAll<HTMLElement>('.share-room-button').forEach((button) => {
    if (button.dataset['shareBound'] === 'true') return;
    button.dataset['shareBound'] = 'true';
    button.addEventListener('click', async () => {
      const roomCode = (button.dataset['roomCode'] ?? '').replace(/\D/g, '').slice(0, 6);
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
        const originalText = button.textContent;
        button.textContent = 'Enlace copiado';
        window.setTimeout(() => { button.textContent = originalText; }, 1800);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        await copyText(url).catch(() => undefined);
      }
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