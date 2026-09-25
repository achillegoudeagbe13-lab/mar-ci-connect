# Architecture de montée en charge

## État actuel

- Express + Socket.io dans un service Render unique.
- Présence et rooms en mémoire.
- WebRTC mesh : chaque navigateur ouvre une connexion avec chaque participant.
- Adapté au prototype et aux petites salles.

## Étape Redis

Quand plusieurs instances Render seront nécessaires :

1. Ajouter un Redis managé.
2. Définir `REDIS_URL` dans Render.
3. Installer `@socket.io/redis-adapter`, `redis` et connecter l’adapter avant `io.on('connection')`.
4. Déplacer la présence, les rooms et les permissions dans Redis avec TTL.
5. Garder le service `/health` et ajouter un check Redis.

Le `Map` actuel ne doit pas être utilisé avec plusieurs instances : deux utilisateurs d’une même room peuvent être routés vers des processus différents.

## Étape SFU

Au-delà de petites réunions, remplacer `useWebRTC` mesh par un client SFU :

- LiveKit est recommandé pour accélérer la livraison.
- mediasoup est recommandé pour garder le contrôle du serveur Node.
- Janus ou Jitsi sont des alternatives opérationnelles.

Le contrat UI à conserver :

- `localStream`
- `remoteStreams`
- `toggleTrack`
- `toggleScreenShare`
- `connectionQuality`

Ainsi, les contrôles, le canvas, le recorder et la transcription restent découplés du transport vidéo.

## Données durables

À ajouter avec PostgreSQL/S3 :

- utilisateurs et sessions
- rooms et invitations expirables
- messages et extraits de code
- transcriptions Markdown
- métadonnées des enregistrements
- snapshots/export des annotations
