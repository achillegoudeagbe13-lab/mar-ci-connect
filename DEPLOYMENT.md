# Déploiement PWA et URL Socket.io

## Configuration locale

Copier `.env.example` vers `.env.local`, puis renseigner :

```env
VITE_SIGNAL_SERVER_URL=http://localhost:3001
VITE_ICE_SERVERS=stun:stun.l.google.com:19302
```

`VITE_SIGNAL_SERVER_URL` est lu au build par Vite. En production, le client peut aussi recevoir `?socketUrl=https://...` : cette valeur est prioritaire et est utilisée par l’extension VS Code.

## PWA sur Vercel

Le fichier `vercel.json` configure :

- Build : `npm run build`
- Dossier publié : `dist`
- Fallback SPA vers `index.html`

Définir dans Vercel avant le build :

```text
VITE_SIGNAL_SERVER_URL=https://<serveur-socketio>.onrender.com
VITE_ICE_SERVERS=stun:stun.l.google.com:19302,turn:<domaine-turn>:3478
```

## PWA en Static Site Render

Utiliser `render-static.yaml` comme blueprint séparé du service Node défini dans `render.yaml`.

- Build command : `npm ci && npm run build`
- Publish directory : `dist`
- Rewrite : `/*` vers `/index.html`

Définir les mêmes variables `VITE_*`. Le serveur Socket.io doit rester un **Web Service** distinct, avec `CLIENT_ORIGIN` égal à l’URL de la PWA.

## Extension VS Code

Dans les paramètres VS Code :

```json
{
  "marciConnect.applicationUrl": "https://<pwa>.vercel.app",
  "marciConnect.signalServerUrl": "https://<serveur-socketio>.onrender.com"
}
```

Le wrapper ajoute automatiquement `socketUrl` à l’URL de la PWA. Laisser `signalServerUrl` vide si l’application embarquée contient déjà la bonne valeur `VITE_SIGNAL_SERVER_URL`.