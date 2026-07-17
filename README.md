# Bingo Musical

Aplicación web móvil para convertir una playlist de Spotify en una partida privada de bingo musical.

## Estado

- Ionic + Angular.
- Pantalla inicial de prueba.
- Despliegue automático en GitHub Pages.
- Firebase aplazado y sin conexiones activas.
- Spotify será la primera integración funcional.

## Desarrollo local

```bash
npm install
npm start
```

Build de producción:

```bash
npm run build
```

Build para GitHub Pages:

```bash
npm run build:pages
```

## GitHub Pages

Cada `push` a `main` ejecuta `.github/workflows/deploy-pages.yml`.

Cuando el repositorio sea público, configura `Settings → Pages → Build and deployment → GitHub Actions`.

URL prevista:

`https://zariweyo.github.io/bingo_musical/`

## Spotify

La aplicación web utilizará OAuth 2.0 Authorization Code con PKCE. Nunca se incluirá un `client_secret` en el frontend.

Configuración prevista, todavía no activa:

```text
SPOTIFY_CLIENT_ID=
SPOTIFY_REDIRECT_URI=https://zariweyo.github.io/bingo_musical/auth/callback
```

## Firebase

Firebase no se instalará ni inicializará durante esta fase. Se incorporará después de validar la experiencia de usuario y la importación de playlists.
