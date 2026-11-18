using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;

#nullable disable

namespace Dogo.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddWalksAndRegistrations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "walks",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    organizer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    starts_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    duration_minutes = table.Column<int>(type: "integer", nullable: false),
                    location = table.Column<Point>(type: "geography(Point, 4326)", nullable: false),
                    location_label = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    max_dogs = table.Column<int>(type: "integer", nullable: false),
                    allowed_sizes = table.Column<string[]>(type: "text[]", nullable: false),
                    leash_rule = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    rules = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    access = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_walks", x => x.id);
                    table.ForeignKey(
                        name: "fk_walks_users_organizer_id",
                        column: x => x.organizer_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "registrations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    walk_id = table.Column<Guid>(type: "uuid", nullable: false),
                    dog_id = table.Column<Guid>(type: "uuid", nullable: true),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_registrations", x => x.id);
                    table.ForeignKey(
                        name: "fk_registrations_dogs_dog_id",
                        column: x => x.dog_id,
                        principalTable: "dogs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_registrations_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_registrations_walks_walk_id",
                        column: x => x.walk_id,
                        principalTable: "walks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_registrations_dog_id",
                table: "registrations",
                column: "dog_id");

            migrationBuilder.CreateIndex(
                name: "ix_registrations_user_id",
                table: "registrations",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_registrations_walk_id_dog_id_active",
                table: "registrations",
                columns: new[] { "walk_id", "dog_id" },
                unique: true,
                filter: "status IN ('Pending', 'Accepted')");

            migrationBuilder.CreateIndex(
                name: "ix_registrations_walk_id_status",
                table: "registrations",
                columns: new[] { "walk_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_walks_location",
                table: "walks",
                column: "location")
                .Annotation("Npgsql:IndexMethod", "gist");

            migrationBuilder.CreateIndex(
                name: "ix_walks_organizer_id",
                table: "walks",
                column: "organizer_id");

            migrationBuilder.CreateIndex(
                name: "ix_walks_starts_at",
                table: "walks",
                column: "starts_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "registrations");

            migrationBuilder.DropTable(
                name: "walks");
        }
    }
}
