# Migration du transport média vers un SFU

## Objectif

Le projet est aujourd’hui construit sur un WebRTC mesh, ce qui convient au prototype et aux petites salles. La couche UI est déjà pensée pour rester stable, mais le transport sous-jacent doit être remplacé par un flux SFU pour une vraie montée en charge.

## Couche actuelle

Le contrat UI est déjà centralisé autour de ces éléments :

- `localStream`
- `remoteStreams`
- `toggleTrack`
- `toggleScreenShare`
- `connectionQuality`

Cette interface est désormais abstraite dans la couche de transport média, ce qui permet de remplacer le backend sans casser l’écran.

## Trajectoire recommandée

### Option 1 — LiveKit

Avantages :

- très rapide à mettre en œuvre,
- excellent support pour la réduction du travail serveur,
- bonne ergonomie pour la gestion des participants.

À utiliser si le besoin est la vitesse de livraison et la fiabilité de la solution standard.

### Option 2 — mediasoup

Avantages :

- plus de contrôle sur le serveur,
- meilleure flexibilité pour les cas métier spécifiques,
- plus facile à personnaliser au niveau du routing média.

À utiliser si le produit doit évoluer avec des contraintes spécifiques ou une logique réseau avancée.

## Interface cible à préserver

Le transport SFU devra exposer exactement le même contrat fonctionnel :

```ts
{
  localStream,
  remoteStreams,
  isSharing,
  connectionQuality,
  toggleTrack,
  toggleScreenShare,
}
```

L’UI ne doit pas savoir si le transport est mesh, SFU ou autre. Elle ne dépend que de cette API.

## Étapes de migration recommandées

1. Introduire la couche de transport abstraite dans `src/lib/media-transport.ts`.
2. Faire passer l’implémentation WebRTC existante par cette façade.
3. Ajouter un adaptateur SFU en gardant la même API.
4. Remplacer une seule interface au niveau du hook sans toucher la vue.
5. Valider qualité réseau, reconnexions, partage d’écran, switch de pistes et modération.
6. Ajouter un test d’intégration sur un scénario multi-participant.

## Points d’attention

- Les état de `connectionQuality` doivent rester cohérents entre mesh et SFU.
- Les reconnexions doivent être gérées par le transport, pas par l’UI.
- Le swap de piste pour la caméra / écran doit rester transparent pour la vue.
- Les événements de `moderation` doivent être exploités au niveau du transport.

## Conclusion

La migration ne doit pas être un refactor de l’UI. Elle doit être un changement de transport sous l’API déjà stable, ce qui garantit un risque de rupture faible et une transition maîtrisée.
