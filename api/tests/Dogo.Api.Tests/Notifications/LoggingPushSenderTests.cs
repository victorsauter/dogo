using Dogo.Api.Infrastructure.Push;
using Microsoft.Extensions.Logging;

namespace Dogo.Api.Tests.Notifications;

/// <summary>The log provider never writes the token, and the body (private message excerpt) only at Debug level.</summary>
public sealed class LoggingPushSenderTests
{
    private sealed class ListLogger : ILogger<LoggingPushSender>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception)));
    }

    [Fact]
    public async Task The_body_is_logged_at_debug_level_only_and_the_token_never()
    {
        var logger = new ListLogger();
        var message = new PushMessage(
            Guid.NewGuid(), "ExponentPushToken[secret]", "Tour du lac", "Bob : mon adresse est 3 rue des Lilas",
            new Dictionary<string, string> { ["type"] = "message_posted" });

        await new LoggingPushSender(logger).SendAsync([message], TestContext.Current.CancellationToken);

        Assert.DoesNotContain(logger.Entries, e => e.Message.Contains("secret", StringComparison.Ordinal));
        Assert.DoesNotContain(logger.Entries, e => e.Level >= LogLevel.Information && e.Message.Contains("rue des Lilas", StringComparison.Ordinal));
        Assert.Contains(logger.Entries, e => e.Level == LogLevel.Information && e.Message.Contains("Tour du lac", StringComparison.Ordinal));
        Assert.Contains(logger.Entries, e => e.Level == LogLevel.Debug && e.Message.Contains("rue des Lilas", StringComparison.Ordinal));
    }
}
