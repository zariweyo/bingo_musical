import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Auth,
  User,
  browserLocalPersistence,
  setPersistence,
  signInAnonymously,
} from '@angular/fire/auth';

@Injectable({ providedIn: 'root' })
export class AnonymousAuthService {
  private readonly auth = inject(Auth);
  private readonly currentUserState = signal<User | null>(this.auth.currentUser);
  private readonly readyState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly user = this.currentUserState.asReadonly();
  readonly uid = computed(() => this.currentUserState()?.uid ?? null);
  readonly isReady = this.readyState.asReadonly();
  readonly error = this.errorState.asReadonly();

  async initialize(): Promise<void> {
    this.errorState.set(null);

    try {
      await setPersistence(this.auth, browserLocalPersistence);

      const user = this.auth.currentUser ?? (await signInAnonymously(this.auth)).user;
      this.currentUserState.set(user);
    } catch (error) {
      this.errorState.set(
        error instanceof Error ? error.message : 'No se pudo crear la identidad anónima.',
      );
      throw error;
    } finally {
      this.readyState.set(true);
    }
  }
}
