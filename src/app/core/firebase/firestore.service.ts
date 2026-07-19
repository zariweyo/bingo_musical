import { Injectable, inject } from '@angular/core';
import {
  CollectionReference,
  DocumentData,
  DocumentReference,
  Firestore,
  SetOptions,
  addDoc,
  collection,
  doc,
  setDoc,
} from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class FirestoreService {
  private readonly firestore = inject(Firestore);

  createDocument<T extends DocumentData>(
    collectionPath: string,
    data: T,
  ): Promise<DocumentReference<T>> {
    const targetCollection = collection(
      this.firestore,
      collectionPath,
    ) as CollectionReference<T>;

    return addDoc(targetCollection, data);
  }

  setDocument<T extends DocumentData>(
    documentPath: string,
    data: T,
    options: SetOptions = { merge: true },
  ): Promise<void> {
    const targetDocument = doc(this.firestore, documentPath) as DocumentReference<T>;
    return setDoc(targetDocument, data, options);
  }
}
