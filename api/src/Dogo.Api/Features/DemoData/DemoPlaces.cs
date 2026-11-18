namespace Dogo.Api.Features.DemoData;

/// <summary>A meeting point: a label as an organizer would write it, and a point on land near the village.</summary>
internal sealed record DemoPlace(string Label, double Latitude, double Longitude);

/// <summary>
/// Meeting points in and around Seppois-le-Haut, all within about 12 km of it. Coordinates are
/// close to each village's town hall (geo.api.gouv.fr), moved a few hundred metres towards a
/// plausible car park, path or pond. The labels are fictional.
/// </summary>
internal static class DemoPlaces
{
    /// <summary>Seppois-le-Haut (47°32′02″ N, 7°11′04″ E), the centre of the demo community.</summary>
    public const double CentreLatitude = 47.5339;
    public const double CentreLongitude = 7.1844;

    public static readonly DemoPlace SeppoisTownHall = new("Parking de la mairie, Seppois-le-Haut", 47.5324, 7.1858);
    public static readonly DemoPlace SeppoisForest = new("Départ du chemin forestier au-dessus du village, Seppois-le-Haut", 47.5287, 7.1912);
    public static readonly DemoPlace SeppoisStadium = new("Parking du stade, Seppois-le-Haut", 47.5352, 7.1812);
    public static readonly DemoPlace ClubGround = new("Terrain du Club canin du Sundgau, Seppois-le-Haut", 47.5368, 7.1889);
    public static readonly DemoPlace SeppoisBasRiver = new("Bord de la Largue, près du pont, Seppois-le-Bas", 47.5371, 7.1694);
    public static readonly DemoPlace SeppoisBasChurch = new("Place de l'église, Seppois-le-Bas", 47.5358, 7.1748);
    public static readonly DemoPlace PfetterhouseForest = new("Parking de la forêt, Pfetterhouse", 47.5048, 7.1598);
    public static readonly DemoPlace PfetterhousePond = new("Étang de pêche, Pfetterhouse", 47.5118, 7.1716);
    public static readonly DemoPlace UeberstrassBridge = new("Pont sur la Largue, Ueberstrass", 47.5468, 7.1562);
    public static readonly DemoPlace RechesyPonds = new("Parking des étangs, Réchésy", 47.5122, 7.1148);
    public static readonly DemoPlace LargitzenChapel = new("Chapelle des champs, Largitzen", 47.5638, 7.1902);
    public static readonly DemoPlace BiselField = new("Terrain de football, Bisel", 47.5372, 7.2196);
    public static readonly DemoPlace DannemarieCanal = new("Chemin de halage du canal, Dannemarie", 47.6288, 7.1281);
    public static readonly DemoPlace DannemarieStation = new("Parking de la gare, Dannemarie", 47.6301, 7.1221);
    public static readonly DemoPlace AltkirchRiver = new("Promenade au bord de l'Ill, Altkirch", 47.6178, 7.2398);
    public static readonly DemoPlace AltkirchForest = new("Lisière de la forêt, parking du sentier, Altkirch", 47.6119, 7.2297);
}
