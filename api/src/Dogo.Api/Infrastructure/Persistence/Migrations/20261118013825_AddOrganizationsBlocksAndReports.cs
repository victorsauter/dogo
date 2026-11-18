using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dogo.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddOrganizationsBlocksAndReports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_walks_users_organizer_id",
                table: "walks");

            migrationBuilder.AlterColumn<Guid>(
                name: "organizer_id",
                table: "walks",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "organization_id",
                table: "walks",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "blocks",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    blocker_id = table.Column<Guid>(type: "uuid", nullable: false),
                    blocked_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_blocks", x => x.id);
                    table.ForeignKey(
                        name: "fk_blocks_users_blocked_id",
                        column: x => x.blocked_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_blocks_users_blocker_id",
                        column: x => x.blocker_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "organizations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    city = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_by_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_organizations", x => x.id);
                    table.ForeignKey(
                        name: "fk_organizations_users_created_by_id",
                        column: x => x.created_by_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "reports",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    reporter_id = table.Column<Guid>(type: "uuid", nullable: true),
                    target_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    target_dog_id = table.Column<Guid>(type: "uuid", nullable: true),
                    walk_id = table.Column<Guid>(type: "uuid", nullable: true),
                    type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    facts = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    admin_note = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_reports", x => x.id);
                    table.ForeignKey(
                        name: "fk_reports_dogs_target_dog_id",
                        column: x => x.target_dog_id,
                        principalTable: "dogs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_reports_users_reporter_id",
                        column: x => x.reporter_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_reports_users_target_user_id",
                        column: x => x.target_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_reports_walks_walk_id",
                        column: x => x.walk_id,
                        principalTable: "walks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "memberships",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_memberships", x => x.id);
                    table.ForeignKey(
                        name: "fk_memberships_organizations_organization_id",
                        column: x => x.organization_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_memberships_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_walks_organization_id_starts_at",
                table: "walks",
                columns: new[] { "organization_id", "starts_at" });

            migrationBuilder.CreateIndex(
                name: "ix_blocks_blocked_id",
                table: "blocks",
                column: "blocked_id");

            migrationBuilder.CreateIndex(
                name: "ix_blocks_blocker_id_blocked_id",
                table: "blocks",
                columns: new[] { "blocker_id", "blocked_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_memberships_organization_id_status",
                table: "memberships",
                columns: new[] { "organization_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_memberships_organization_id_user_id_active",
                table: "memberships",
                columns: new[] { "organization_id", "user_id" },
                unique: true,
                filter: "status IN ('Pending', 'Accepted')");

            migrationBuilder.CreateIndex(
                name: "ix_memberships_user_id",
                table: "memberships",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_organizations_created_by_id_status",
                table: "organizations",
                columns: new[] { "created_by_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_organizations_status",
                table: "organizations",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_reports_reporter_id",
                table: "reports",
                column: "reporter_id");

            migrationBuilder.CreateIndex(
                name: "ix_reports_status_created_at",
                table: "reports",
                columns: new[] { "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_reports_target_dog_id",
                table: "reports",
                column: "target_dog_id");

            migrationBuilder.CreateIndex(
                name: "ix_reports_target_user_id",
                table: "reports",
                column: "target_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_reports_walk_id",
                table: "reports",
                column: "walk_id");

            migrationBuilder.AddForeignKey(
                name: "fk_walks_organizations_organization_id",
                table: "walks",
                column: "organization_id",
                principalTable: "organizations",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_walks_users_organizer_id",
                table: "walks",
                column: "organizer_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_walks_organizations_organization_id",
                table: "walks");

            migrationBuilder.DropForeignKey(
                name: "fk_walks_users_organizer_id",
                table: "walks");

            migrationBuilder.DropTable(
                name: "blocks");

            migrationBuilder.DropTable(
                name: "memberships");

            migrationBuilder.DropTable(
                name: "reports");

            migrationBuilder.DropTable(
                name: "organizations");

            migrationBuilder.DropIndex(
                name: "ix_walks_organization_id_starts_at",
                table: "walks");

            migrationBuilder.DropColumn(
                name: "organization_id",
                table: "walks");

            migrationBuilder.AlterColumn<Guid>(
                name: "organizer_id",
                table: "walks",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "fk_walks_users_organizer_id",
                table: "walks",
                column: "organizer_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
