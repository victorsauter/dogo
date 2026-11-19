using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dogo.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRefreshTokenFamilies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "family_id",
                table: "refresh_tokens",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            // Existing tokens: each is the first token of its own family (ADR 0035). The default
            // only served to add the column; the application always sets the family.
            migrationBuilder.Sql("UPDATE refresh_tokens SET family_id = id;");
            migrationBuilder.Sql("ALTER TABLE refresh_tokens ALTER COLUMN family_id DROP DEFAULT;");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "replaced_at",
                table: "refresh_tokens",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_refresh_tokens_expires_at",
                table: "refresh_tokens",
                column: "expires_at");

            migrationBuilder.CreateIndex(
                name: "ix_refresh_tokens_family_id",
                table: "refresh_tokens",
                column: "family_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_refresh_tokens_expires_at",
                table: "refresh_tokens");

            migrationBuilder.DropIndex(
                name: "ix_refresh_tokens_family_id",
                table: "refresh_tokens");

            migrationBuilder.DropColumn(
                name: "family_id",
                table: "refresh_tokens");

            migrationBuilder.DropColumn(
                name: "replaced_at",
                table: "refresh_tokens");
        }
    }
}
