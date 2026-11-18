using Dogo.Api.Features.Dogs;
using static Dogo.Api.Features.Dogs.DogSize;

namespace Dogo.Api.Features.DemoData;

/// <summary>A breed of the demo data set: its usual size and the English Wikipedia article whose lead photo illustrates it.</summary>
/// <param name="WikipediaTitle">Null for mixed breeds, which keep the placeholder.</param>
internal sealed record DemoBreed(string Name, DogSize Size, string? WikipediaTitle);

/// <summary>Breeds used by the demo dogs, with a size consistent with the breed (spec §2: Petit, Moyen, Grand).</summary>
internal static class DemoBreeds
{
    public static readonly IReadOnlyDictionary<string, DemoBreed> ByName = new DemoBreed[]
    {
        // Small.
        new("Bichon frisé", Small, "Bichon Frisé"),
        new("Bichon maltais", Small, "Maltese dog"),
        new("Bouledogue français", Small, "French Bulldog"),
        new("Carlin", Small, "Pug"),
        new("Caniche nain", Small, "Poodle"),
        new("Cavalier King Charles", Small, "Cavalier King Charles Spaniel"),
        new("Chihuahua", Small, "Chihuahua (dog breed)"),
        new("Fox-terrier", Small, "Wire Fox Terrier"),
        new("Jack Russell terrier", Small, "Jack Russell Terrier"),
        new("Lhassa apso", Small, "Lhasa Apso"),
        new("Papillon", Small, "Papillon dog"),
        new("Schnauzer nain", Small, "Miniature Schnauzer"),
        new("Shih tzu", Small, "Shih Tzu"),
        new("Spitz nain", Small, "Pomeranian dog"),
        new("Teckel", Small, "Dachshund"),
        new("West Highland white terrier", Small, "West Highland White Terrier"),
        new("Yorkshire terrier", Small, "Yorkshire Terrier"),
        new("Croisé caniche", Small, null),
        new("Croisé griffon", Small, null),
        new("Croisé jack russell", Small, null),
        new("Croisé terrier", Small, null),

        // Medium.
        new("Basenji", Medium, "Basenji"),
        new("Basset hound", Medium, "Basset Hound"),
        new("Beagle", Medium, "Beagle"),
        new("Berger australien", Medium, "Australian Shepherd"),
        new("Berger des Shetland", Small, "Shetland Sheepdog"),
        new("Border collie", Medium, "Border Collie"),
        new("Bull terrier", Medium, "Bull Terrier"),
        new("Cocker anglais", Medium, "English Cocker Spaniel"),
        new("Épagneul breton", Medium, "Brittany dog"),
        new("Kooikerhondje", Medium, "Kooikerhondje"),
        new("Schnauzer moyen", Medium, "Standard Schnauzer"),
        new("Shiba inu", Medium, "Shiba Inu"),
        new("Springer anglais", Medium, "English Springer Spaniel"),
        new("Staffordshire bull terrier", Medium, "Staffordshire Bull Terrier"),
        new("Welsh corgi pembroke", Small, "Pembroke Welsh Corgi"),
        new("Whippet", Medium, "Whippet"),
        new("Croisé beagle", Medium, null),
        new("Croisé berger australien", Medium, null),
        new("Croisé border collie", Medium, null),
        new("Croisé épagneul", Medium, null),
        new("Croisé fox", Small, null),
        new("Croisé staff", Medium, null),

        // Large.
        new("Berger allemand", Large, "German Shepherd"),
        new("Berger belge malinois", Large, "Belgian Malinois"),
        new("Berger blanc suisse", Large, "Berger Blanc Suisse"),
        new("Bouvier bernois", Large, "Bernese Mountain Dog"),
        new("Boxer", Large, "Boxer (dog)"),
        new("Braque allemand", Large, "German Shorthaired Pointer"),
        new("Braque de Weimar", Large, "Weimaraner"),
        new("Cane corso", Large, "Cane Corso"),
        new("Dobermann", Large, "Dobermann"),
        new("Dogue allemand", Large, "Great Dane"),
        new("Golden retriever", Large, "Golden Retriever"),
        new("Grand bouvier suisse", Large, "Greater Swiss Mountain Dog"),
        new("Hovawart", Large, "Hovawart"),
        new("Husky sibérien", Medium, "Siberian Husky"),
        new("Labrador", Large, "Labrador Retriever"),
        new("Leonberg", Large, "Leonberger"),
        new("Montagne des Pyrénées", Large, "Great Pyrenees"),
        new("Rhodesian ridgeback", Large, "Rhodesian Ridgeback"),
        new("Rottweiler", Large, "Rottweiler"),
        new("Samoyède", Large, "Samoyed dog"),
        new("Setter irlandais", Large, "Irish Setter"),
        new("Terre-neuve", Large, "Newfoundland dog"),
        new("Croisé beauceron", Large, null),
        new("Croisé berger", Large, null),
        new("Croisé dobermann", Large, null),
        new("Croisé hovawart", Large, null),
        new("Croisé husky", Medium, null),
        new("Croisé labrador", Large, null),
        new("Croisé malamute", Large, null),
    }.ToDictionary(b => b.Name);
}
