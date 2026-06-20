#!/bin/bash
# Read all stdin into a variable
input=$(cat)

if [[ "$input" == *"Coach (Engineering Manager)"* ]]; then
  cat << 'JSON_EOF'
{
  "reply": "C'est une excellente question ! Si nous prenons l'Option A, cela ajoutera un peu de complexité au composant Navbar partagé, mais ça nous évitera de dupliquer du code. Je recommande cette approche. Qu'en pensez-vous ?"
}
JSON_EOF
else
  cat << 'JSON_EOF'
{
  "updatedBody": "Le composant `SplashPage` a besoin d'une navbar transparente avec le logo centré et un bouton `S'inscrire` en haut à droite.\n\n### Décisions (depuis les commentaires)\n- **Option A** choisie : Ajouter la variante `splash` au composant `Navbar` partagé.\n- La PR #474 a été mergée, donc on peut se baser sur les composants actuels.\n\n### Scope de l'Epic\nMigrer la navbar du composant SplashPage vers le nouveau système de Navbar partagé.",
  "tasks": [
    {
      "title": "Ajouter la variante `splash` au composant Navbar",
      "agent": "claude-jr",
      "spec": "Modifier `src/components/Navbar.tsx` pour accepter une prop `variant=\"splash\"`. Cette variante doit rendre la navbar transparente avec un effet d'overlay, et intégrer le bouton CTA spécifique à la page Splash."
    },
    {
      "title": "Mettre à jour SplashPage.tsx pour utiliser la nouvelle Navbar partagée",
      "agent": "ollama",
      "spec": "Dans `src/pages/SplashPage.tsx`, remplacer le composant Navbar interne (`lv2-nav`) par le composant partagé `<Navbar variant=\"splash\" />`. S'assurer que les ancres fonctionnent."
    }
  ]
}
JSON_EOF
fi
