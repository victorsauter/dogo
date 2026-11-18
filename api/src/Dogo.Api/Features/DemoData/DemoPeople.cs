using Dogo.Api.Features.Dogs;
using static Dogo.Api.Features.Dogs.LeashHabit;
using static Dogo.Api.Features.Dogs.Reactivity;
using static Dogo.Api.Features.Dogs.Sociability;

namespace Dogo.Api.Features.DemoData;

/// <summary>A fictional person of the demo community. <see cref="Key"/> gives the dev sign-in subject (<c>demo-marie-schmitt</c>).</summary>
internal sealed record DemoPerson(string FirstName, string LastName, string Bio, IReadOnlyList<DemoDog> Dogs)
{
    public string DisplayName => $"{FirstName} {LastName}";

    public string Key => DemoText.Slug(DisplayName);
}

/// <summary>A fictional dog. Its size comes from its breed (<see cref="DemoBreeds"/>), its birth date from <see cref="AgeMonths"/>.</summary>
internal sealed record DemoDog(
    string Name, string Breed, int AgeMonths, Sociability Sociability, Reactivity Reactivity, LeashHabit LeashHabit, string Description = "");

/// <summary>
/// The 50 owners and 10 dog educators of the demo data set, living in and around Seppois-le-Haut
/// (Sundgau, Haut-Rhin). All names are fictional; any resemblance is coincidental.
/// </summary>
internal static class DemoPeople
{
    public static readonly IReadOnlyList<DemoPerson> Owners =
    [
        P("Marie", "Schmitt", "Infirmière à Altkirch, je marche tous les soirs vers la forêt avec mes deux loulous. Toujours partante pour une balade tranquille.",
            D("Filou", "Border collie", 46, Easygoing, None, OffLeash, "Ne vit que pour la balle, mais revient au premier coup de sifflet."),
            D("Praline", "Cavalier King Charles", 30, Easygoing, None, OnLeash, "Douce et un peu gourmande.")),
        P("Thomas", "Haas", "Développeur en télétravail à Pfetterhouse : j'ai besoin de sortir à midi !",
            D("Oslo", "Berger australien", 26, Easygoing, Mild, LongLine, "Jeune et plein d'énergie, encore en apprentissage du rappel.")),
        P("Léonie", "Muller", "Institutrice à la retraite, je connais tous les chemins du Sundgau.",
            D("Gribouille", "Teckel", 122, Selective, Mild, OnLeash, "Râleur avec les grands chiens, adorable avec les humains."),
            D("Nala", "Labrador", 70, Easygoing, None, OffLeash)),
        P("Joseph", "Ehret", "Agriculteur à Largitzen. Mes chiens connaissent les champs mieux que moi.",
            D("Bello", "Berger allemand", 84, Easygoing, None, OffLeash),
            D("Hector", "Bouvier bernois", 60, Easygoing, None, LongLine, "Un nounours de 50 kilos."),
            D("Lili", "Jack Russell terrier", 108, Selective, Mild, OnLeash, "Chasse tout ce qui bouge : à tenir en laisse près des bois.")),
        P("Julie", "Bernard", "Nouvelle arrivée à Seppois-le-Bas, je cherche des copains de balade pour Câline.",
            D("Câline", "Golden retriever", 14, Easygoing, None, LongLine, "Quatorze mois, câline comme son nom l'indique.")),
        P("Mathis", "Weber", "Étudiant à Mulhouse, de retour au village le week-end.",
            D("Rocky", "Staffordshire bull terrier", 52, Selective, Mild, OnLeash, "Très gentil avec les gens, préfère les chiens calmes.")),
        P("Odile", "Bilger", "Bénévole au refuge, j'adopte de préférence les chiens âgés.",
            D("Pépère", "Croisé berger", 150, Easygoing, None, OnLeash, "Douze ans et demi, marche doucement mais sûrement."),
            D("Mirabelle", "Croisé griffon", 96, Reserved, None, OnLeash, "Adoptée au refuge, un peu timide au début.")),
        P("Nicolas", "Martin", "",
            D("Kaïko", "Husky sibérien", 40, Easygoing, Mild, OnLeash, "Fugueur : jamais sans laisse !"),
            D("Yuki", "Croisé husky", 30, Easygoing, None, OnLeash)),
        P("Céline", "Fischer", "Maman de deux enfants et d'un corgi, balades le mercredi après-midi.",
            D("Biscotte", "Welsh corgi pembroke", 34, Easygoing, None, OffLeash)),
        P("Christophe", "Wolff", "Chasseur de champignons à l'automne, randonneur toute l'année.",
            D("Taïga", "Braque allemand", 58, Easygoing, None, OffLeash),
            D("Sirius", "Braque de Weimar", 30, Easygoing, Mild, LongLine)),
        P("Véronique", "Kessler", "Pas de balade sans thermos de café.",
            D("Lucky", "Beagle", 64, Easygoing, None, LongLine, "Le nez collé au sol, il faut parfois l'attendre."),
            D("Pistou", "Croisé jack russell", 60, Easygoing, Mild, OnLeash)),
        P("Frédéric", "Moreau", "Installé à Bisel depuis peu, originaire de Nantes.",
            D("Ulysse", "Épagneul breton", 44, Easygoing, None, OffLeash),
            D("Plume", "Épagneul breton", 18, Easygoing, None, LongLine, "Jeune chienne curieuse de tout.")),
        P("Isabelle", "Specklin", "Passionnée de cani-rando, je cours aussi le dimanche matin.",
            D("Sky", "Berger blanc suisse", 50, Easygoing, None, OffLeash),
            D("Flocon", "Samoyède", 36, Easygoing, None, LongLine, "Une boule de poils qui adore le froid.")),
        P("Jean-Marc", "Litzler", "Ancien gendarme ; mon chien aussi est à la retraite.",
            D("Zorro", "Berger belge malinois", 132, Selective, Mild, OnLeash, "Ancien chien de travail, calme mais attentif.")),
        P("Nathalie", "Durand", "Je promène Pistache avant le travail, souvent vers 7 h.",
            D("Pistache", "Bichon frisé", 54, Easygoing, None, OnLeash),
            D("Fleur", "Caniche nain", 80, Easygoing, None, OnLeash)),
        P("Sébastien", "Stoecklin", "",
            D("Diesel", "Boxer", 48, Easygoing, Mild, LongLine, "Joueur et un peu brusque avec les petits."),
            D("Moka", "Croisé labrador", 24, Easygoing, None, OffLeash)),
        P("Aurélie", "Hartmann", "Vétérinaire à Dannemarie, mais en balade je suis juste la maîtresse de Pixel.",
            D("Pixel", "Berger des Shetland", 66, Easygoing, None, OffLeash)),
        P("Florian", "Sutter", "Coureur à pied, je cherche des balades sportives.",
            D("Flash", "Whippet", 38, Easygoing, None, OffLeash, "Très rapide, très câlin."),
            D("Tornade", "Croisé berger australien", 20, Easygoing, Mild, LongLine)),
        P("Élise", "Zimmermann", "Je travaille la socialisation de Mochi, petit à petit.",
            D("Mochi", "Shiba inu", 22, Reserved, Mild, OnLeash, "Indépendant, n'aime pas trop qu'on le touche.")),
        P("Maxime", "Leroy", "",
            D("Thor", "Dogue allemand", 42, Easygoing, None, OnLeash, "Un géant très doux."),
            D("Loki", "Rhodesian ridgeback", 36, Selective, None, LongLine),
            D("Freya", "Leonberg", 28, Easygoing, None, LongLine)),
        P("Chloé", "Baumann", "Étudiante vétérinaire, en stage dans le coin pour l'hiver.",
            D("Pruneau", "Carlin", 60, Easygoing, None, OnLeash, "Ronfle en marchant, c'est normal.")),
        P("Romain", "Gasser", "On fait la balade du dimanche en famille, avec les enfants.",
            D("Oscar", "Labrador", 96, Easygoing, None, OffLeash),
            D("Ficelle", "Jack Russell terrier", 26, Easygoing, Mild, OnLeash)),
        P("Laura", "Petit", "",
            D("Lola", "Chihuahua", 72, Reserved, Mild, OnLeash, "Préfère les petits chiens, a peur des grands."),
            D("Tic", "Chihuahua", 40, Selective, Mild, OnLeash)),
        P("Kévin", "Ritter", "Mécanicien à Hirsingue. Balades le soir et le samedi.",
            D("Tyson", "Cane corso", 46, Selective, Strong, OnLeash, "Réactif avec les mâles : je garde mes distances, merci de votre compréhension.")),
        P("Emma", "Hug", "Je découvre la région avec Gaïa.",
            D("Gaïa", "Kooikerhondje", 32, Easygoing, None, LongLine)),
        P("Louis", "Fournier", "Retraité, je marche chaque matin autour des étangs.",
            D("Médor", "Basset hound", 100, Easygoing, None, OnLeash, "Lent mais endurant."),
            D("Choupette", "Yorkshire terrier", 118, Selective, None, OnLeash)),
        P("Jade", "Meyer", "",
            D("Nougat", "Spitz nain", 30, Easygoing, Mild, OnLeash),
            D("Caramel", "Caniche nain", 52, Easygoing, None, OnLeash)),
        P("Arthur", "Brand", "Photographe amateur : j'emporte souvent mon appareil en balade.",
            D("Whisky", "Setter irlandais", 54, Easygoing, None, OffLeash),
            D("Ébène", "Croisé labrador", 90, Easygoing, None, OffLeash)),
        P("Inès", "Garnier", "",
            D("Luna", "Bichon maltais", 40, Easygoing, None, OnLeash)),
        P("Paul", "Jermann", "Je promène aussi le chien de ma voisine le jeudi.",
            D("Balou", "Terre-neuve", 62, Easygoing, None, LongLine, "Adore l'eau : prévoir une serviette."),
            D("Cookie", "Cocker anglais", 44, Easygoing, None, OffLeash)),
        P("Margaux", "Roux", "Convaincue par l'éducation positive.",
            D("Simba", "Hovawart", 34, Easygoing, None, LongLine),
            D("Indy", "Schnauzer nain", 58, Selective, Mild, OnLeash)),
        P("Benoît", "Horny", "",
            D("Tank", "Bull terrier", 50, Selective, Mild, OnLeash)),
        P("Claire", "Wiederkehr", "Je viens de Suisse pour marcher côté français, c'est à deux pas.",
            D("Bärli", "Grand bouvier suisse", 46, Easygoing, None, LongLine),
            D("Fée", "Papillon", 70, Easygoing, None, OnLeash)),
        P("Patrick", "Lambert", "",
            D("Duke", "Dobermann", 60, Selective, Mild, OnLeash, "Impressionnant mais sage."),
            D("Nina", "Croisé dobermann", 26, Easygoing, None, LongLine)),
        P("Monique", "Biehler", "Septuagénaire en pleine forme, je préfère les balades courtes et plates.",
            D("Kiki", "West Highland white terrier", 110, Easygoing, None, OnLeash)),
        P("Gérard", "Koenig", "Marcheur du Club vosgien, j'ai rejoint dogo pour Tobby.",
            D("Tobby", "Springer anglais", 76, Easygoing, None, OffLeash),
            D("Saucisse", "Teckel", 168, Easygoing, None, OnLeash, "Quatorze ans, finit parfois la balade dans les bras.")),
        P("Brigitte", "Faure", "",
            D("Roxy", "Croisé staff", 64, Selective, Strong, OnLeash, "Réactive avec les chiens inconnus, on y travaille. Balades en petit groupe seulement.")),
        P("Bernard", "Vonarb", "Je vis à Ueberstrass, au bord de la Largue.",
            D("Pacha", "Montagne des Pyrénées", 80, Reserved, None, OnLeash),
            D("Pirate", "Croisé fox", 36, Easygoing, Mild, OffLeash)),
        P("Mireille", "Bohrer", "Ma chienne et moi aimons les balades calmes, sans courir.",
            D("Daisy", "Lhassa apso", 90, Reserved, None, OnLeash)),
        P("Yannick", "Chevalier", "Pompier volontaire à Seppois.",
            D("Ranger", "Berger allemand", 30, Easygoing, None, LongLine),
            D("Volt", "Basenji", 26, Reserved, Mild, LongLine)),
        P("Sophie", "Rousseau", "",
            D("Fripouille", "Fox-terrier", 48, Easygoing, Mild, OnLeash),
            D("Pilou", "Croisé caniche", 38, Easygoing, None, OnLeash)),
        P("Alexandre", "Moritz", "Je cherche des balades le samedi matin.",
            D("Ziggy", "Schnauzer moyen", 40, Easygoing, None, LongLine),
            D("Ouzo", "Croisé border collie", 70, Easygoing, None, OffLeash)),
        P("Agathe", "Girard", "En reconversion pour devenir éducatrice canine.",
            D("Iris", "Bouledogue français", 28, Easygoing, None, OnLeash),
            D("Hopper", "Croisé terrier", 7, Easygoing, Mild, LongLine, "Chiot adopté il y a peu : tout est nouveau pour lui."),
            D("Suki", "Shih tzu", 98, Easygoing, None, OnLeash)),
        P("Quentin", "Strub", "",
            D("Maverick", "Labrador", 20, Easygoing, None, OffLeash, "Jeune fou qui saute partout.")),
        P("Anaïs", "Bonnet", "Je promène Vanille avec ma fille de huit ans.",
            D("Vanille", "Golden retriever", 56, Easygoing, None, OffLeash)),
        P("Damien", "Heyer", "Balades tôt le matin, avant la traite.",
            D("Bandit", "Croisé beauceron", 74, Selective, Mild, LongLine),
            D("Gamine", "Border collie", 98, Easygoing, None, OffLeash)),
        P("Valérie", "Perrin", "",
            D("Lune", "Croisé épagneul", 110, Reserved, None, OnLeash, "Adoptée à sept ans, très calme."),
            D("Cachou", "Cavalier King Charles", 84, Easygoing, None, OnLeash)),
        P("Stéphane", "Schaffhauser", "Je vis à Réchésy, à la frontière du Territoire de Belfort.",
            D("Elvis", "Beagle", 66, Easygoing, None, LongLine),
            D("Ringo", "Croisé beagle", 54, Easygoing, None, LongLine)),
        P("Elsa", "Kauffmann", "Je débute avec mon premier chien, tous les conseils sont bienvenus !",
            D("Pompon", "Bichon frisé", 8, Easygoing, None, OnLeash, "Chiot de huit mois qui découvre le monde.")),
        P("Lukas", "Walter", "",
            D("Kaiser", "Rottweiler", 56, Selective, Strong, OnLeash, "Ne supporte pas d'être approché de face par un chien inconnu."),
            D("Ronja", "Croisé hovawart", 44, Easygoing, None, LongLine)),
    ];

    public static readonly IReadOnlyList<DemoPerson> Educators =
    [
        P("Sandrine", "Gutzwiller", "Éducatrice canine diplômée, présidente du Club canin du Sundgau. Méthodes positives, cours collectifs le samedi matin.",
            D("Java", "Border collie", 62, Easygoing, None, OffLeash, "Chienne de démonstration du club.")),
        P("Marc", "Hell", "Moniteur au Club canin du Sundgau depuis quinze ans, j'accompagne surtout les chiens réactifs.",
            D("Gaston", "Berger allemand", 90, Easygoing, None, OffLeash)),
        P("Caroline", "Fuchs", "Éducatrice et comportementaliste à Dannemarie. Séances individuelles et balades éducatives en petit groupe.",
            D("Opale", "Berger blanc suisse", 70, Easygoing, None, OffLeash)),
        P("Hugo", "Lefebvre", "Éducateur canin indépendant à Altkirch : balades encadrées pour chiots et jeunes chiens, conseils sur mesure."),
        P("Pauline", "Dubois", "Monitrice au Club canin du Sundgau, je m'occupe de l'école du chiot.",
            D("Twix", "Jack Russell terrier", 50, Easygoing, None, OffLeash),
            D("Pétale", "Cavalier King Charles", 40, Easygoing, None, OnLeash)),
        P("Manon", "Wagner", "Guide de cani-rando, fondatrice de Cani'Sentiers. Sorties entre Sundgau et Jura suisse toute l'année.",
            D("Yoda", "Husky sibérien", 66, Easygoing, None, OnLeash),
            D("Kenai", "Croisé malamute", 48, Easygoing, None, LongLine)),
        P("Antoine", "Riss", "Accompagnateur en montagne et éducateur canin, j'encadre les sorties longues de Cani'Sentiers.",
            D("Scout", "Border collie", 54, Easygoing, None, OffLeash)),
        P("Lucie", "Reinhard", "Éducatrice canine en cours d'installation à Hirsingue, spécialisée en éducation positive.",
            D("Noisette", "Croisé épagneul", 36, Easygoing, None, LongLine)),
        P("Jérôme", "Kempf", "Éducateur chez Éducanine de la Largue, passionné de pistage.",
            D("Tango", "Braque allemand", 44, Easygoing, None, OffLeash)),
        P("Delphine", "Ott", "Éducatrice canine et monitrice de canicross chez Cani'Sentiers."),
    ];

    private static DemoPerson P(string firstName, string lastName, string bio, params DemoDog[] dogs) => new(firstName, lastName, bio, dogs);

    private static DemoDog D(
        string name, string breed, int ageMonths, Sociability sociability, Reactivity reactivity, LeashHabit leashHabit, string description = "") =>
        new(name, breed, ageMonths, sociability, reactivity, leashHabit, description);
}
