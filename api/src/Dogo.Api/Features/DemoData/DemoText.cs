using System.Text;

namespace Dogo.Api.Features.DemoData;

internal static class DemoText
{
    private const string Accented = "àâäáãåçéèêëíìîïñóòôöõúùûüýÿæœß";
    private static readonly string[] Plain =
        ["a", "a", "a", "a", "a", "a", "c", "e", "e", "e", "e", "i", "i", "i", "i", "n", "o", "o", "o", "o", "o", "u", "u", "u", "u", "y", "y", "ae", "oe", "ss"];

    /// <summary>« Léonie Muller » → <c>leonie-muller</c>. Written by hand: the API runs with invariant globalization.</summary>
    public static string Slug(string text)
    {
        var slug = new StringBuilder(text.Length);
        foreach (var c in text.ToLowerInvariant())
        {
            var accented = Accented.IndexOf(c, StringComparison.Ordinal);
            if (accented >= 0)
            {
                slug.Append(Plain[accented]);
            }
            else if (char.IsAsciiLetterOrDigit(c))
            {
                slug.Append(c);
            }
            else if (slug.Length > 0 && slug[^1] != '-')
            {
                slug.Append('-');
            }
        }

        return slug.ToString().TrimEnd('-');
    }
}
