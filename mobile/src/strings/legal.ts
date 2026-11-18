/**
 * Provisional legal texts (terms of use and privacy policy), in French.
 * They describe what the app really does today; a lawyer must review and
 * complete them before publication (perimetre-v1.md, « Sécurité et signalements »).
 * Placeholders between square brackets are deliberate: no company name, address
 * or contact e-mail is invented here.
 */

export interface LegalSection {
  title: string;
  paragraphs: readonly string[];
}

export const legalFr = {
  provisionalNotice: 'Version provisoire — à faire valider avant la publication',
  placeholdersNote:
    'Les passages entre crochets [ ] sont à compléter avant la publication : aucun nom de société, adresse ni e-mail de contact n’est encore défini.',
  lastUpdate: 'Dernière mise à jour : novembre 2026 (version provisoire).',
  terms: {
    title: 'Conditions d’utilisation',
    intro:
      'dogo est une application qui permet de trouver et d’organiser des balades entre chiens, près de chez toi. En l’utilisant, tu acceptes ces conditions.',
    sections: [
      {
        title: 'Qui édite dogo',
        paragraphs: [
          'dogo est édité par [NOM DE L’ÉDITEUR], [ADRESSE]. Contact : [E-MAIL DE CONTACT].',
        ],
      },
      {
        title: 'Ton compte',
        paragraphs: [
          'Tu te connectes avec ton compte Apple ou Google. Tu donnes des informations exactes sur ton profil et sur tes chiens, et tu gardes l’accès à ton compte pour toi seul.',
          'Tu peux supprimer ton compte à tout moment depuis Profil, puis Réglages.',
        ],
      },
      {
        title: 'Les balades et les risques',
        paragraphs: [
          'dogo met des personnes en relation : l’application n’organise pas les balades des particuliers et n’y participe pas.',
          'Rencontrer d’autres chiens comporte des risques : morsures, bagarres, chutes, maladies, accidents. Chaque propriétaire reste seul responsable de son chien, de son comportement, de sa laisse, de sa vaccination et de son assurance responsabilité civile, ainsi que du respect des règles locales (par exemple laisse et muselière pour les chiens de 1re et 2e catégorie dans les lieux publics).',
          'Tu décides si une balade te convient : lis les règles, le gabarit admis et les profils des chiens inscrits avant de participer.',
        ],
      },
      {
        title: 'Ce que tu publies',
        paragraphs: [
          'Ton profil, tes photos, la description de tes chiens, tes balades et tes messages sont de ta responsabilité. Ils ne doivent pas être illégaux, trompeurs, injurieux ni porter atteinte à une autre personne.',
        ],
      },
      {
        title: 'Les organisations',
        paragraphs: [
          'Une organisation (club, éducateur…) est validée par l’équipe dogo avant d’être visible. Elle peut proposer des balades professionnelles, réservées à ses membres.',
          'Le paiement éventuel d’une balade professionnelle se fait en dehors de l’application ; dogo n’en est pas partie.',
        ],
      },
      {
        title: 'Blocage et signalement',
        paragraphs: [
          'Tu peux bloquer une personne : elle ne peut plus s’inscrire à tes balades et elle n’en est pas prévenue.',
          'Tu peux signaler une personne, un chien ou une balade. Un signalement est privé, lu par une personne de l’équipe, et ne déclenche aucune sanction automatique. La personne concernée peut répondre. L’équipe peut suspendre un compte qui ne respecte pas ces conditions.',
        ],
      },
      {
        title: 'Responsabilité de dogo',
        paragraphs: [
          '[À FAIRE RÉDIGER PAR UN JURISTE : limites de responsabilité de la plateforme, notamment si un chien déjà signalé blesse ensuite.]',
        ],
      },
      {
        title: 'Changements et droit applicable',
        paragraphs: [
          'Ces conditions peuvent évoluer ; tu seras prévenu des changements importants. [DROIT APPLICABLE ET TRIBUNAL COMPÉTENT À PRÉCISER.]',
        ],
      },
    ] satisfies LegalSection[],
  },
  privacy: {
    title: 'Politique de confidentialité',
    intro:
      'Voici les données que dogo utilise, pourquoi, et comment tu gardes la main dessus. Nous ne vendons pas tes données.',
    sections: [
      {
        title: 'Qui est responsable',
        paragraphs: [
          '[NOM DE L’ÉDITEUR], [ADRESSE]. Contact pour toute question sur tes données : [E-MAIL DE CONTACT].',
        ],
      },
      {
        title: 'Les données que nous recevons',
        paragraphs: [
          'Ton identifiant de compte Apple ou Google, et ton adresse e-mail si le service nous la transmet.',
          'Ton profil : nom affiché, présentation, photo.',
          'Tes chiens : nom, gabarit, caractère, date de naissance, race, description, photo.',
          'Tes balades, tes inscriptions, tes messages dans les discussions, tes adhésions à des organisations et les personnes que tu bloques.',
          'Tes signalements, qui sont nominatifs et ne sont lisibles que par l’équipe.',
          'Si tu autorises les notifications, l’identifiant de notification de ton téléphone.',
        ],
      },
      {
        title: 'Ta position',
        paragraphs: [
          'Ta position est utilisée sur ton téléphone pour centrer la carte et chercher les balades proches. Elle n’est pas enregistrée sur nos serveurs : la recherche envoie seulement le centre de la zone affichée pour répondre, sans le garder dans ton compte.',
          'Le point de rendez-vous d’une balade que tu organises est, lui, enregistré : c’est le lieu que tu choisis, pas ta position.',
        ],
      },
      {
        title: 'À quoi servent ces données',
        paragraphs: [
          'Faire fonctionner l’application : profils, balades, inscriptions, discussions, organisations.',
          'T’envoyer les notifications que tu as choisies (inscriptions, changements de balade, messages, rappels).',
          'Assurer la sécurité : blocages, signalements et suspension d’un compte qui ne respecte pas les conditions.',
        ],
      },
      {
        title: 'Qui voit quoi',
        paragraphs: [
          'Ton profil (nom, présentation, photo, chiens) est visible des autres membres.',
          'La discussion d’une balade est visible de l’organisateur et des personnes dont le chien est accepté.',
          'La liste des membres d’une organisation n’est visible que de son responsable et de ses éducateurs.',
          'Les signalements ne sont visibles que de l’équipe dogo.',
        ],
      },
      {
        title: 'Durée de conservation et suppression',
        paragraphs: [
          'Tes données sont conservées tant que ton compte existe. Tu peux le supprimer depuis Profil, puis Réglages : tes chiens, inscriptions, appareils, blocages, adhésions et jetons sont alors supprimés. Tes messages et tes signalements restent, sans ton nom ; tes balades restent dans l’historique des autres participants, sans organisateur.',
          '[DURÉE DE CONSERVATION DES SIGNALEMENTS À FIXER.]',
        ],
      },
      {
        title: 'Tes droits',
        paragraphs: [
          'Tu peux demander l’accès à tes données, leur correction ou leur suppression en écrivant à [E-MAIL DE CONTACT]. Tu peux aussi saisir la CNIL.',
        ],
      },
      {
        title: 'Prestataires',
        paragraphs: [
          'La connexion passe par Apple ou Google. Les notifications sont transmises par le service de notifications d’Expo. [HÉBERGEUR DES DONNÉES ET LIEU D’HÉBERGEMENT À PRÉCISER.]',
        ],
      },
    ] satisfies LegalSection[],
  },
} as const;
