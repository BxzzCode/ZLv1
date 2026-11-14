# ZombiLand — FPS + Firebase lobby

## Abrir en SPCK
Abrí `index.html` desde la vista previa servida de SPCK (no como archivo `file://`). Se requiere internet para Three.js y Firebase SDK.

## Firebase configurado
- Firebase App SDK 13.3.0 por CDN.
- Authentication: inicio de sesión anónimo.
- Realtime Database: salas públicas y privadas de hasta 2 jugadores.
- Emparejamiento público: busca una sala `waiting` con lugar libre; si no encuentra, crea una.
- Grupo privado: crea una sala con código de 6 caracteres y permite unirse por código.
- El anfitrión puede iniciar cuando están conectados los 2 jugadores.
- Se usa `onDisconnect` para liberar el puesto si un jugador pierde conexión.

## Reglas de Realtime Database
Antes de probar el emparejamiento, pegá el contenido de `firebase-database.rules.json` en Firebase Console → Realtime Database → Reglas y publicalo. Las reglas requieren autenticación y restringen la reserva de puestos al UID del jugador; no habilites reglas públicas.

## Estado del multijugador de esta entrega
Esta versión incluye la primera etapa de replicación: al iniciar una sala, cada cliente publica su posición, altura, orientación horizontal y vertical, identificador de puesto y nombre visible (JUGADOR 1/2) en `rooms/{roomId}/players/{uid}`. Los demás clientes crean un modelo 3D remoto y suavizan su movimiento. La publicación se limita aproximadamente a 10 actualizaciones por segundo y el registro propio se elimina al desconectarse.

**Todavía no es un multijugador completo:** disparos, impactos, daño, salud, zombis, botín y oleadas siguen siendo locales a cada cliente. Esta entrega tampoco incorpora autoridad de servidor contra trampas. La sincronización de movimiento usa Realtime Database para una primera prueba y deberá medirse con dos o tres dispositivos reales.

## Reglas de Realtime Database
Además de las salas, las reglas ahora permiten que cada usuario autenticado escriba únicamente su propio registro de jugador dentro de una sala en la que ocupa un puesto. La eliminación del propio registro también está permitida para la limpieza por desconexión.

## Controles
- PC: WASD/flechas, ratón, clic para disparar, R recargar, Espacio saltar.
- Móvil: joystick, arrastrar lado derecho para mirar, botones de disparo y salto.


## Correcciones de emparejamiento (noviembre 2026)
- Las partidas públicas ya no muestran ni comparten código en la interfaz.
- El buscador público solo se une a salas públicas con el anfitrión todavía ocupando el espacio 1.
- Los códigos solo sirven para entrar a grupos privados; no se puede entrar a una sala pública mediante el formulario privado.
- Si el anfitrión se desconecta, Firebase elimina la sala completa mediante onDisconnect, evitando salas huérfanas.
- Las salas privadas también verifican que el anfitrión siga conectado.
- Se mantiene el inicio con exactamente 2 jugadores.


## Salas online: 2 jugadores
- Todas las salas admiten exactamente 2 jugadores para iniciar.
- El jugador del espacio 1 es el anfitrión y tiene el botón para iniciar.
- Las salas públicas se completan al conectarse el segundo jugador; no hay rotación automática del anfitrión.
- La rotación automática solo existe en salas públicas. Las salas privadas no tienen cuenta regresiva ni cambio automático de anfitrión.
- Si el anfitrión de una sala pública se desconecta, la sala permanece disponible; el siguiente jugador puede reclamar el espacio 1 si está libre. Las salas privadas se eliminan cuando se desconecta su anfitrión.
- Actualizá las reglas de Realtime Database con el archivo `firebase-database.rules.json` incluido.



## Correcciones de inicio sincronizado
- El anfitrión cambia el estado de la sala a `playing` y guarda `startedAt`.
- Las reglas permiten al anfitrión escribir `startedAt` durante la transición desde `waiting`; antes faltaba ese permiso y podía bloquear la actualización múltiple.
- Cada cliente escucha el estado de la sala y entra cuando recibe `playing`. La condición usa `onlineStarted` para no depender del estado visual general del juego.
