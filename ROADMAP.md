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
