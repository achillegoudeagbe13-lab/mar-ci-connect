# Déploiement Render de MAR-CI Connect

Le dépôt contient un service Render unique : Express sert le build Vite et Socket.io sur le même domaine.

## Déploiement

1. Créer un **Web Service** Render connecté au dépôt.
2. Utiliser `render.yaml` avec :
   - Build : `npm ci && npm run build`
   - Start : `npm start`
   - Health check : `/health`
3. Définir `CLIENT_ORIGIN` avec l’URL publique Render, par exemple `https://mar-ci-connect.onrender.com`.
4. Définir `VITE_ICE_SERVERS` avant le build avec des serveurs STUN/TURN séparés par des virgules.
5. Déployer puis vérifier `https://<service>.onrender.com/health`.

## Variables

- `PORT` : fourni automatiquement par Render.
- `CLIENT_ORIGIN` : origines frontend autorisées, séparées par des virgules.
- `RENDER_EXTERNAL_URL` : URL Render, généralement détectée automatiquement via `RENDER_EXTERNAL_HOSTNAME`.
- `MAX_ROOM_PARTICIPANTS` : limite par room, 12 par défaut.
- `VITE_SIGNAL_SERVER_URL` : laisser vide avec le service unique; renseigner seulement si le signalement est séparé.
- `VITE_ICE_SERVERS` : URLs STUN/TURN. Pour la production, prévoir TURN, pas uniquement STUN.

## Limites actuelles

- L’état des rooms est en mémoire : un seul Web Service Render est requis pour cette version.
- Pour plusieurs instances, ajouter Redis et un adapter Socket.io Redis.
- Le WebRTC actuel est en mesh : prévoir un SFU (LiveKit, mediasoup ou Janus) au-delà de petits groupes.
- Render Free peut mettre le service en veille; un plan payant ou un monitoring externe est recommandé pour la production.
