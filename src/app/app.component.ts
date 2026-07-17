import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  IonApp,
  IonButton,
  IonContent,
  IonIcon,
  IonText,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { musicalNotes, playCircle } from 'ionicons/icons';

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
    addIcons({ musicalNotes, playCircle });
  }
}
