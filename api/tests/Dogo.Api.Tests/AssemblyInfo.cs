using Dogo.Api.Tests.Infrastructure;
using Xunit.Sdk;
using Xunit.v3;

// One PostGIS container and one API host for the whole run; tests run one at a time and
// each starts from an empty database (see ApiFixture.ResetAsync).
[assembly: AssemblyFixture(typeof(ApiFixture))]
[assembly: Parallelization(Mode = ParallelMode.None)]
