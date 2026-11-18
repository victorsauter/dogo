using System.Collections.Concurrent;
using Dogo.Api.Infrastructure.Push;

namespace Dogo.Api.Tests.Infrastructure;

/// <summary>Records what would be sent instead of sending it. Tokens in <see cref="Unregistered"/> are reported as no longer registered.</summary>
public sealed class RecordingPushSender : IPushSender
{
    private readonly ConcurrentQueue<PushMessage> _sent = new();

    public ConcurrentDictionary<string, bool> Unregistered { get; } = new();

    public IReadOnlyList<PushMessage> Sent => [.. _sent];

    public Task<PushResult> SendAsync(IReadOnlyList<PushMessage> messages, CancellationToken cancellationToken)
    {
        foreach (var message in messages)
        {
            _sent.Enqueue(message);
        }

        return Task.FromResult(new PushResult(messages.Select(m => m.Token).Where(Unregistered.ContainsKey).ToList()));
    }

    public void Clear()
    {
        _sent.Clear();
        Unregistered.Clear();
    }
}
