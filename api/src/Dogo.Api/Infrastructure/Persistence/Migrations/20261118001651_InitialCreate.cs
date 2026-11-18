using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dogo.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:postgis", ",,");

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    provider = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    provider_subject = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    display_name = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    bio = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    photo_file_name = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "dogs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    photo_file_name = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    size = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    birth_date = table.Column<DateOnly>(type: "date", nullable: true),
                    breed = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    sociability = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    reactivity = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    leash_habit = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_dogs", x => x.id);
                    table.ForeignKey(
                        name: "fk_dogs_users_owner_id",
                        column: x => x.owner_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "refresh_tokens",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_refresh_tokens", x => x.id);
                    table.ForeignKey(
                        name: "fk_refresh_tokens_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_dogs_owner_id",
                table: "dogs",
                column: "owner_id");

            migrationBuilder.CreateIndex(
                name: "ix_refresh_tokens_token_hash",
                table: "refresh_tokens",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_refresh_tokens_user_id",
                table: "refresh_tokens",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_users_provider_provider_subject",
                table: "users",
                columns: new[] { "provider", "provider_subject" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "dogs");

            migrationBuilder.DropTable(
                name: "refresh_tokens");

            migrationBuilder.DropTable(
                name: "users");
        }
    }
}
