import { provideAppInitializer, inject } from '@angular/core';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { AppComponent } from './app/app.component';
import { AnonymousAuthService } from './app/core/firebase/anonymous-auth.service';
import { firebaseConfig } from './environments/firebase.config';

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular(),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideAppInitializer(() => inject(AnonymousAuthService).initialize()),
  ],
}).catch((error: unknown) => console.error(error));
