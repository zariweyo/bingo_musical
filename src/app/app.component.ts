import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  IonApp,
  IonButton,
  IonContent,
  IonIcon,
  IonText,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  logInOutline,
  musicalNotes,
  shieldCheckmarkOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonContent, IonButton, IonIcon, IonText],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  constructor() {
    addIcons({ musicalNotes, logInOutline, shieldCheckmarkOutline });
  }

  connectWithSpotify(): void {
    window.alert(
      'La pantalla ya está preparada. El siguiente paso es registrar Bingo Musical en Spotify y añadir el Client ID para activar el acceso OAuth con PKCE.',
    );
  }
}
