# Roadmap

## Bingo sincronizado con Spotify

### Registro de canciones reproducidas

**Objetivo:** facilitar la validación de líneas y bingos sin automatizar el juego ni eliminar la atención del jugador.

- Registrar en la base de datos cada canción reproducida por Spotify durante una partida.
- Almacenar, como mínimo:
  - Spotify Track ID.
  - Título de la canción.
  - Artista o artistas.
  - Timestamp de inicio.
  - Orden de reproducción.
  - Identificador de la partida.
- El jugador seguirá marcando manualmente las canciones en su cartón.
- La aplicación no marcará automáticamente ninguna casilla.
- El jugador podrá equivocarse y marcar una canción que no haya sonado.
- El jugador también podrá olvidar marcar una canción que sí haya sonado.
- Al solicitar una línea o un bingo, la aplicación comparará las casillas marcadas por el jugador con el histórico real de canciones reproducidas.
- La validación deberá detectar:
  - Canciones marcadas que todavía no han sonado.
  - Canciones válidas que han sonado pero que el jugador no ha marcado.
  - El orden real de reproducción cuando sea necesario para revisar la partida.

### Control de reproducción por el anfitrión

**Objetivo:** permitir que el anfitrión gestione Spotify desde la propia aplicación durante la partida.

- El anfitrión podrá controlar la reproducción sin salir de Bingo Musical.
- Controles previstos:
  - Reproducir y pausar.
  - Pasar a la siguiente canción.
  - Volver a la canción anterior.
  - Ajustar el volumen.
  - Seleccionar el dispositivo de reproducción disponible mediante Spotify Connect.
- La aplicación deberá mostrar el estado actual de reproducción, incluyendo canción, artista, progreso y dispositivo activo.
- Cada cambio de canción deberá integrarse con el registro persistente de canciones reproducidas de la partida.
- El control de reproducción no debe marcar automáticamente los cartones de los jugadores.
- Esta funcionalidad dependerá de los permisos de Spotify necesarios para modificar el estado de reproducción y, cuando corresponda, de una cuenta Spotify Premium.

### Playlists predefinidas en Firestore

**Objetivo:** ofrecer al anfitrión colecciones preparadas para iniciar partidas sin tener que buscar o montar manualmente una playlist en Spotify.

- Mantener en Firestore un catálogo propio de playlists predefinidas para Bingo Musical.
- Cada playlist deberá incluir, como mínimo:
  - Nombre.
  - Descripción.
  - Imagen o portada.
  - Categoría o temática.
  - Idioma o ámbito musical.
  - Nivel de dificultad.
  - Estado activo o publicado.
  - Indicador de contenido gratuito o premium.
  - Fecha de creación y actualización.
- Las canciones de cada playlist deberán almacenarse también en Firestore, incluyendo:
  - Spotify Track ID.
  - Título.
  - Artista o artistas.
  - Duración.
  - Posición o criterio de ordenación.
- Firestore será la fuente de verdad del catálogo del juego y Spotify actuará como sistema de reproducción.
- Al iniciar una partida, la aplicación podrá:
  - Leer una playlist predefinida desde Firestore.
  - Seleccionar todas o una cantidad limitada de canciones.
  - Mezclar el orden cuando corresponda.
  - Crear una playlist temporal en la cuenta de Spotify del anfitrión o preparar la cola de reproducción.
  - Guardar en la partida la selección y el orden definitivos.
- Guardar las canciones en Firestore permitirá:
  - Sustituir canciones que dejen de estar disponibles en Spotify.
  - Evitar depender de cambios realizados en playlists externas.
  - Reutilizar canciones en distintas categorías.
  - Versionar y revisar el contenido de las playlists.
  - Evitar repeticiones entre partidas.
- Temáticas iniciales posibles:
  - Éxitos de los 80.
  - Pop español.
  - Rock español.
  - Verano.
  - Eurovisión.
  - Disney.
  - Reguetón.
  - Canciones de los 2000.
  - Mix familiar.
- Como evolución futura, crear un panel de administración para buscar canciones en Spotify, añadirlas al catálogo, ordenarlas, clasificarlas y publicar playlists.

### Principio de diseño

La integración con Spotify debe facilitar la comprobación, pero no jugar por el usuario. La atención, el reconocimiento de las canciones y el marcado manual siguen siendo parte esencial del juego.

### Persistencia y validación

La validación no debe depender únicamente del estado actual de Spotify. Cada canción detectada debe persistirse en la base de datos para que una partida pueda comprobarse durante el juego o revisarse posteriormente.

### Posibles mejoras futuras

- Historial completo de partidas.
- Revisión de una partida después de finalizar.
- Panel del presentador con las canciones ya reproducidas.
- Estadísticas de canciones, tiempos y patrones de juego.
- Exportación del histórico de una partida.
- Reanudación de partidas interrumpidas.
