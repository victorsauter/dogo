namespace Dogo.Api.Features.DemoData;

/// <summary>
/// One message of a demo thread. <see cref="Speaker"/> 0 is the organizer, 1 the first accepted
/// participant (another person than the organizer), 2 the second… <see cref="Minutes"/> is relative to
/// the walk start, or to now for <see cref="DemoConversation.RelativeToNow"/> threads (upcoming walks).
/// <c>{dog}</c> becomes the author's dog on that walk, <c>{organizer}</c> the organizer's first name.
/// </summary>
internal sealed record DemoLine(int Speaker, int Minutes, string Text);

internal sealed record DemoConversation(bool RelativeToNow, DemoLine[] Lines);

/// <summary>Threads of about twenty walks, keyed by <see cref="DemoWalk.Conversation"/> and <see cref="DemoWalk.PastConversation"/>.</summary>
internal static class DemoConversations
{
    private const int Hour = 60;
    private const int Day = 24 * Hour;

    public static readonly IReadOnlyDictionary<string, DemoConversation> ByKey = new Dictionary<string, DemoConversation>
    {
        // Upcoming walks: messages already written, relative to now.
        ["up-pond-full"] = Now(
            L(1, -2 * Day, "Super idée ! Je viens avec {dog}. On se gare où exactement ?"),
            L(0, -2 * Day + 25, "Il y a un petit parking en terre juste avant l'étang, sinon le long de la route forestière. Je serai là dix minutes avant."),
            L(2, -Day - 3 * Hour, "C'est complet, mais si quelqu'un se désiste, je connais une voisine qui serait ravie de venir avec son chien."),
            L(3, -20 * Hour, "Est-ce qu'on fait le tour complet de l'étang ? {dog} n'aime pas trop la boue…"),
            L(0, -19 * Hour, "Oui, le tour complet, environ 4 km. Ça peut être boueux côté forêt : prévoyez des bottes !"),
            L(1, -3 * Hour, "Bottes prêtes, merci {organizer} !")),
        ["up-lunch"] = Now(
            L(0, -3 * Hour, "Je confirme pour tout à l'heure, même si le ciel est gris."),
            L(1, -50, "Je risque d'avoir cinq minutes de retard, ma réunion déborde. Partez sans moi, je vous rattrape sur le chemin."),
            L(0, -45, "Pas de souci, on marche doucement au début.")),
        ["up-puppies"] = Now(
            L(0, -Day, "Bonjour à tous ! C'est la première vraie sortie de Câline avec d'autres chiens, alors on ira tout doucement."),
            L(1, -22 * Hour, "Avec plaisir ! {dog} est très calme, ça devrait bien se passer."),
            L(2, -5 * Hour, "Il fait nuit tôt en ce moment, on reste sur le chemin éclairé ? J'ai une lampe frontale au cas où."),
            L(0, -4 * Hour, "On reste le long de la route éclairée, et on raccourcit si besoin.")),
        ["up-largue-hike"] = Now(
            L(0, -3 * Day, "Prévoyez de l'eau pour vous et les chiens, il n'y a pas de point d'eau avant Ueberstrass."),
            L(1, -3 * Day + 2 * Hour, "On peut laisser une voiture à Ueberstrass pour le retour ? Trois heures à l'aller, ça fait loin pour revenir à pied."),
            L(0, -2 * Day - 4 * Hour, "Bonne idée. On dépose deux voitures au pont d'Ueberstrass à 8 h 30, puis on remonte tous ensemble au départ."),
            L(2, -2 * Day, "Je peux prendre deux personnes, et un chien dans le coffre."),
            L(3, -Day - 2 * Hour, "Est-ce que je pourrai lâcher {dog} sur le chemin ? Son rappel est bon."),
            L(0, -Day, "Oui, tant qu'on n'est pas près des pâtures. Je vous dirai sur place."),
            L(1, -6 * Hour, "Météo annoncée : couvert mais sec. Parfait !")),
        ["up-rechesy"] = Now(
            L(0, -2 * Day, "Bonjour à tous, rendez-vous au parking des étangs. Le chemin est plat, idéal pour les petits comme pour les grands."),
            L(1, -Day - 5 * Hour, "Merci Léonie ! On peut venir avec une poussette ?"),
            L(0, -Day - 4 * Hour, "Oui, le chemin est large et stabilisé, aucun problème."),
            L(2, -10 * Hour, "{dog} n'est pas très à l'aise avec les grands chiens, je resterai à l'arrière du groupe si ça ne dérange personne."),
            L(3, -9 * Hour, "Aucun souci, on fera attention.")),
        ["up-chapels"] = Now(
            L(0, -4 * Day, "Ça fait du monde, chouette ! On part à l'heure précise pour rentrer avant la nuit."),
            L(1, -4 * Day + 30, "Combien de kilomètres à peu près ?"),
            L(0, -4 * Day + 50, "Environ 7 km, avec une montée vers la chapelle. Rien de terrible."),
            L(2, -3 * Day, "Je viendrai peut-être avec ma sœur, elle n'a pas de chien, ça pose problème ?"),
            L(0, -3 * Day + Hour, "Pas du tout, les marcheurs sans chien sont les bienvenus."),
            L(3, -Day, "On peut se garer devant la chapelle ou il vaut mieux rester au village ?"),
            L(0, -Day + 40, "Mieux vaut se garer au village, près de l'église : le chemin vers la chapelle est étroit."),
            L(4, -2 * Hour, "Si tu en refais une, je m'inscris tout de suite. C'est le genre de balade qu'on adore avec {dog}.")),
        ["up-mulled-wine"] = Now(
            L(0, -2 * Day, "J'apporte le vin chaud, et du jus de pomme chaud pour les enfants. Pensez aux gobelets réutilisables !"),
            L(1, -Day - 6 * Hour, "Génial ! J'apporterai des bredele."),
            L(2, -Day, "Je peux venir avec {dog} ? Quelques aboiements au début, puis tout rentre dans l'ordre."),
            L(0, -20 * Hour, "Bien sûr, on fera les présentations tranquillement au parking.")),

        // Past walks: before and after the start.
        ["series-village-past"] = Start(
            L(0, -Day, "Rendez-vous comme d'habitude devant la mairie. Gilets fluo conseillés, il fait nuit tôt."),
            L(1, -3 * Hour, "{dog} et moi serons là !"),
            L(2, -Hour, "On aura dix minutes de retard, partez sans nous, on vous rejoint au lavoir."),
            L(0, 75, "Merci pour la balade ! La prochaine fois, même heure, même endroit."),
            L(1, 2 * Hour, "Merci {organizer}, {dog} dort déjà."),
            L(3, Day, "{dog} s'est fait une entorse en courant après un chat : pause de deux semaines. À bientôt !")),
        ["series-club-past"] = Start(
            L(0, -2 * Day, "Rappel : collier ou harnais bien ajusté, laisse de 2 m et des friandises en quantité. On travaille la marche en laisse et les croisements."),
            L(1, -Day, "Est-ce que je peux venir avec la longe de 10 m ?"),
            L(0, -Day + Hour, "Garde-la pour la fin de séance ; au début, on reste en laisse courte."),
            L(2, 2 * Hour, "Merci pour les conseils, ça change tout avec {dog} !"),
            L(0, 3 * Hour, "Bravo à tous, beaux progrès. Pensez à refaire l'exercice du demi-tour cette semaine.")),
        ["series-canirando-past"] = Start(
            L(0, -3 * Day, "Pour ceux qui découvrent : baudrier pour vous, harnais de traction pour le chien et chaussures de rando. Le parcours fait 9 km."),
            L(1, -2 * Day, "Je n'ai pas de harnais de traction, un harnais classique suffit ?"),
            L(0, -2 * Day + Hour, "Pour une première, oui. J'en aurai deux à prêter au départ."),
            L(2, -Day, "Chiens à jeun deux heures avant, c'est bien ça ?"),
            L(0, -Day + 30, "Exactement, et pas de gros repas juste après non plus."),
            L(3, 4 * Hour, "Super sortie, les chiens étaient ravis et nous un peu fatigués !"),
            L(1, 5 * Hour, "Merci Manon, je reviens la semaine prochaine avec un vrai harnais.")),
        ["past-forest"] = Start(
            L(0, -2 * Day, "Les feuilles sont magnifiques en ce moment, j'espère qu'il fera beau !"),
            L(1, -Day, "La météo annonce un peu de pluie le matin, mais ça devrait être sec l'après-midi."),
            L(2, -30, "On est garés au bout du chemin, on arrive."),
            L(0, 2 * Hour, "Merci à tous, très belle balade. Les chiens se sont super bien entendus !"),
            L(3, 3 * Hour, "J'ai pris plein de photos, je les envoie ce soir à ceux qui veulent."),
            L(1, 3 * Hour + 10, "Oui, moi s'il te plaît ! Celle de {dog} dans les feuilles doit être géniale."),
            L(3, Day, "C'est envoyé par e-mail, dites-moi si vous n'avez rien reçu.")),
        ["past-lunch"] = Start(
            L(0, -2 * Hour, "Ça tient toujours pour ce midi ?"),
            L(1, -Hour, "Oui ! J'arrive avec {dog}."),
            L(2, Hour, "Merci pour la pause, ça fait du bien de sortir de l'écran.")),
        ["past-open-day"] = Start(
            L(0, -5 * Day, "Journée portes ouvertes : balade collective le matin, démonstrations l'après-midi. Venez nombreux !"),
            L(1, -4 * Day, "Il faut être membre du club pour venir à la démonstration ?"),
            L(0, -4 * Day + Hour, "Non, la démonstration est ouverte à tous. Seule la balade est réservée aux membres."),
            L(2, -2 * Day, "On apporte quelque chose pour le repas ?"),
            L(0, -2 * Day + 2 * Hour, "Un dessert ou une boisson, c'est parfait. Le club offre les tartes flambées le midi."),
            L(3, -Day, "Quel temps est prévu ? J'hésite à amener {dog} s'il pleut, la pluie et nous, ça fait deux."),
            L(4, -Day + 20, "Ils annoncent du soleil, viens !"),
            L(5, -Hour, "Le parking du club est plein, on s'est garés dans la rue derrière."),
            L(0, -50, "Merci de prévenir, il reste aussi de la place devant la salle des fêtes."),
            L(6, 3 * Hour, "Superbe journée, merci aux moniteurs !"),
            L(2, 4 * Hour, "Les tartes flambées étaient délicieuses."),
            L(7, 5 * Hour, "{dog} a adoré la démonstration d'agility, on va peut-être s'y mettre."),
            L(0, Day, "Merci à tous d'être venus ! Les photos seront affichées au club la semaine prochaine.")),
        ["past-ponds"] = Start(
            L(0, -Day, "Bonsoir, je rappelle le rendez-vous de demain à l'étang de pêche."),
            L(1, -20 * Hour, "Bien noté, à demain !"),
            L(2, 2 * Hour, "Merci Léonie pour cette balade et pour les explications sur les oiseaux de l'étang !"),
            L(0, 3 * Hour, "Avec plaisir, on refera ça au printemps, quand les grenouilles seront de retour.")),
        ["past-mushrooms"] = Start(
            L(0, -3 * Day, "On ne promet rien côté champignons, mais la balade sera belle de toute façon !"),
            L(1, -2 * Day, "J'ai un panier en trop si quelqu'un en veut un."),
            L(2, -Day, "{dog} goûte tout ce qui traîne par terre, je garderai la longe."),
            L(0, -Day + Hour, "Bonne idée, certains champignons sont toxiques pour les chiens."),
            L(0, 3 * Hour, "Bilan : quelques cèpes, beaucoup de girolles et des chiens épuisés. Merci à tous !"),
            L(3, 4 * Hour, "Omelette aux girolles ce soir, un régal.")),
        ["past-canal-training"] = Start(
            L(0, -2 * Day, "On travaillera le rappel avec distractions : venez avec des friandises très appétentes (fromage, saucisse)."),
            L(1, -Day, "Est-ce que le chemin de halage est fréquenté par des vélos ?"),
            L(0, -Day + Hour, "Un peu, le week-end. Ça fera partie de l'exercice : rester calme quand un vélo passe."),
            L(2, 2 * Hour, "Merci Caroline, {dog} a fait d'énormes progrès en une séance."),
            L(3, 3 * Hour, "Pourrait-on refaire une séance sur la marche en laisse ?"),
            L(0, Day, "Oui, je propose une date d'ici deux semaines : surveillez les balades de l'organisation.")),
        ["past-bisel"] = Start(
            L(0, -2 * Day, "Départ du terrain de foot de Bisel, boucle de 8 km par les champs et la forêt."),
            L(1, -Day, "Il y a des clôtures électriques sur le parcours ?"),
            L(0, -Day + Hour, "Oui, près des prés en sortant du village. On garde les chiens en laisse sur ce tronçon."),
            L(1, -2 * Hour, "Lune est en chaleur depuis hier, je préfère la laisser à la maison pour ne pas perturber les mâles. Désolée !"),
            L(0, -Hour, "Merci de prévenir, c'est très gentil. À la prochaine !"),
            L(2, 3 * Hour, "Merci Gérard, super parcours !")),
        ["past-welcome"] = Start(
            L(0, -3 * Day, "Je viens d'arriver à Seppois-le-Bas, j'organise cette petite balade pour faire connaissance !"),
            L(1, -2 * Day, "Bienvenue au village ! On sera là."),
            L(2, -2 * Day + 3 * Hour, "Bienvenue ! Si tu veux, je te montrerai les beaux chemins vers la forêt."),
            L(0, 2 * Hour, "Merci pour l'accueil, je me sens déjà un peu chez moi ici."),
            L(1, 3 * Hour, "Avec plaisir, à très vite pour une autre balade.")),
        ["past-reactive"] = Start(
            L(0, -2 * Day, "Pour que tout le monde soit à l'aise : au moins 10 mètres entre les chiens, et pas de salutations."),
            L(1, -Day, "Merci pour cette initiative, c'est rare de trouver des balades adaptées."),
            L(0, Hour, "Bravo à {dog} et à toi, très belle progression aujourd'hui."),
            L(1, 2 * Hour, "Merci ! On revient la prochaine fois.")),
        ["past-border"] = Start(
            L(0, -4 * Day, "Départ des étangs de Réchésy, direction la frontière suisse. Pensez à vos papiers d'identité, on passera de l'autre côté !"),
            L(1, -3 * Day, "Le passeport européen du chien est nécessaire aussi ?"),
            L(0, -3 * Day + Hour, "Oui, avec la vaccination contre la rage à jour, on ne sait jamais en cas de contrôle."),
            L(2, 5 * Hour, "Quelle belle journée ! Merci Manon."),
            L(3, 6 * Hour, "Les chiens ont dormi pendant tout le trajet du retour.")),
    };

    private static DemoConversation Now(params DemoLine[] lines) => new(true, lines);

    private static DemoConversation Start(params DemoLine[] lines) => new(false, lines);

    private static DemoLine L(int speaker, int minutes, string text) => new(speaker, minutes, text);
}
