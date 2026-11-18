using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dogo.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddThreadsNotificationsAndSeries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "reminder_sent_at",
                table: "walks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "series_id",
                table: "walks",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "devices",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    expo_push_token = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    platform = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_devices", x => x.id);
                    table.ForeignKey(
                        name: "fk_devices_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "messages",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    walk_id = table.Column<Guid>(type: "uuid", nullable: false),
                    author_id = table.Column<Guid>(type: "uuid", nullable: true),
                    text = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_messages", x => x.id);
                    table.ForeignKey(
                        name: "fk_messages_users_author_id",
                        column: x => x.author_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_messages_walks_walk_id",
                        column: x => x.walk_id,
                        principalTable: "walks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "notification_preferences",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    registrations = table.Column<bool>(type: "boolean", nullable: false),
                    walk_changes = table.Column<bool>(type: "boolean", nullable: false),
                    messages = table.Column<bool>(type: "boolean", nullable: false),
                    reminders = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_preferences", x => x.user_id);
                    table.ForeignKey(
                        name: "fk_notification_preferences_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "walk_series",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    organizer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    time_zone = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_walk_series", x => x.id);
                    table.ForeignKey(
                        name: "fk_walk_series_users_organizer_id",
                        column: x => x.organizer_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_walks_series_id_starts_at",
                table: "walks",
                columns: new[] { "series_id", "starts_at" });

            migrationBuilder.CreateIndex(
                name: "ix_devices_expo_push_token",
                table: "devices",
                column: "expo_push_token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_devices_user_id",
                table: "devices",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_messages_author_id",
                table: "messages",
                column: "author_id");

            migrationBuilder.CreateIndex(
                name: "ix_messages_walk_id_created_at_id",
                table: "messages",
                columns: new[] { "walk_id", "created_at", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_walk_series_organizer_id",
                table: "walk_series",
                column: "organizer_id");

            migrationBuilder.AddForeignKey(
                name: "fk_walks_walk_series_series_id",
                table: "walks",
                column: "series_id",
                principalTable: "walk_series",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_walks_walk_series_series_id",
                table: "walks");

            migrationBuilder.DropTable(
                name: "devices");

            migrationBuilder.DropTable(
                name: "messages");

            migrationBuilder.DropTable(
                name: "notification_preferences");

            migrationBuilder.DropTable(
                name: "walk_series");

            migrationBuilder.DropIndex(
                name: "ix_walks_series_id_starts_at",
                table: "walks");

            migrationBuilder.DropColumn(
                name: "reminder_sent_at",
                table: "walks");

            migrationBuilder.DropColumn(
                name: "series_id",
                table: "walks");
        }
    }
}
