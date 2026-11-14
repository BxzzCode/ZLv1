# ZombiLand — FPS + Firebase lobby

## Abrir en SPCK
Abrí `index.html` desde la vista previa servida de SPCK (no como archivo `file://`). Se requiere internet para Three.js y Firebase SDK.

## Firebase configurado
- Firebase App SDK 13.3.0 por CDN.
- Authentication: inicio de sesión anónimo.
- Realtime Database: salas públicas y privadas de hasta 3 jugadores.
- Emparejamiento público: busca una sala `waiting` con lugar libre; si no encuentra, crea una.
- Grupo privado: crea una sala con código de 6 caracteres y permite unirse por código.
- El anfitrión puede iniciar en cuanto haya 2 jugadores; el tercero es opcional (máximo 3).
- Se usa `onDisconnect` para liberar el puesto si un jugador pierde conexión.

## Reglas de Realtime Database
Antes de probar el emparejamiento, pegá el contenido de `firebase-database.rules.json` en Firebase Console → Realtime Database → Reglas y publicalo. Las reglas requieren autenticación y restringen la reserva de puestos al UID del jugador; no habilites reglas públicas.

## Estado del multijugador de esta entrega
Esta versión incluye la primera etapa de replicación: al iniciar una sala, cada cliente publica su posición, altura, orientación horizontal y vertical, identificador de puesto y nombre visible (JUGADOR 1/2/3) en `rooms/{roomId}/players/{uid}`. Los demás clientes crean un modelo 3D remoto y suavizan su movimiento. La publicación se limita aproximadamente a 10 actualizaciones por segundo y el registro propio se elimina al desconectarse.

**Todavía no es un multijugador completo:** disparos, impactos, daño, salud, zombis, botín y oleadas siguen siendo locales a cada cliente. Esta entrega tampoco incorpora autoridad de servidor contra trampas. La sincronización de movimiento usa Realtime Database para una primera prueba y deberá medirse con dos o tres dispositivos reales.

## Reglas de Realtime Database
Además de las salas, las reglas ahora permiten que cada usuario autenticado escriba únicamente su propio registro de jugador dentro de una sala en la que ocupa un puesto. La eliminación del propio registro también está permitida para la limpieza por desconexión.

## Controles
- PC: WASD/flechas, ratón, clic para disparar, R recargar, Espacio saltar.
- Móvil: joystick, arrastrar lado derecho para mirar, botones de disparo y salto.
