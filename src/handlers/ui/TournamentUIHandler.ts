/**
 * TournamentUIHandler
 *
 * Handles tournament management UI events:
 * - Create tournament
 * - Join tournament
 * - Leave tournament
 * - Mark ready for tournament match
 * - Get tournament status
 * - Get tournament list
 */

import { Player, PlayerManager } from "hytopia";
import { TournamentManager } from "../../../state/tournamentManager";
import { logger } from "../../../utils/GameLogger";

export interface TournamentHandlerDependencies {
  tournamentManager: TournamentManager;
}

export class TournamentUIHandler {
  private deps: TournamentHandlerDependencies;

  constructor(deps: TournamentHandlerDependencies) {
    this.deps = deps;
  }

  /**
   * Handle tournament create
   */
  handleTournamentCreate(player: Player, data: any): void {
    logger.info(`Player ${player.username} creating tournament:`, data);
    logger.info(`Tournament creation request details:`, {
      name: data.name,
      type: data.tournamentType,
      gameMode: data.gameMode,
      maxPlayers: data.maxPlayers,
      registrationTime: data.registrationTime,
      createdBy: player.username,
    });

    try {
      const tournament = this.deps.tournamentManager.createTournament(
        data.name,
        data.tournamentType,
        data.gameMode,
        data.maxPlayers,
        data.registrationTime,
        player.username
      );

      logger.info(`Tournament created successfully, sending response to ${player.username}`);

      const tournamentResponse = {
        type: "tournament-created",
        tournament: {
          id: tournament.id,
          name: tournament.name,
          type: tournament.type,
          gameMode: tournament.gameMode,
          maxPlayers: tournament.maxPlayers,
          status: tournament.status,
          players: Object.values(tournament.players), // Send full player objects
          playerCount: Object.keys(tournament.players).length,
        },
      };

      logger.info(`Sending tournament-created response:`, tournamentResponse);
      player.ui.sendData(tournamentResponse);

      // Broadcast tournament creation to all players
      const allPlayers = PlayerManager.instance.getConnectedPlayers();
      logger.info(`Broadcasting tournament list to ${allPlayers.length} players`);

      allPlayers.forEach((p) => {
        p.ui.sendData({
          type: "tournament-list-updated",
          tournaments: this.deps.tournamentManager.getActiveTournaments().map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            gameMode: t.gameMode,
            maxPlayers: t.maxPlayers,
            status: t.status,
            players: Object.keys(t.players).length,
          })),
        });
      });

      logger.info(`Tournament "${tournament.name}" created and broadcast successfully`);
    } catch (error: any) {
      logger.error("Tournament creation error:", error);
      logger.error("Error stack:", error.stack);

      const errorResponse = {
        type: "tournament-error",
        message: `Failed to create tournament: ${error.message}`,
      };

      logger.info(`Sending tournament-error response:`, errorResponse);
      player.ui.sendData(errorResponse);
    }
  }

  /**
   * Handle tournament join
   */
  handleTournamentJoin(player: Player, data: any): void {
    logger.info(`Player ${player.username} joining tournament: ${data.tournamentId}`);

    try {
      const success = this.deps.tournamentManager.registerPlayer(
        data.tournamentId,
        player.username,
        player.username
      );

      if (success) {
        const tournament = this.deps.tournamentManager.getTournament(data.tournamentId);

        player.ui.sendData({
          type: "tournament-joined",
          tournament: tournament
            ? {
                id: tournament.id,
                name: tournament.name,
                type: tournament.type,
                gameMode: tournament.gameMode,
                maxPlayers: tournament.maxPlayers,
                status: tournament.status,
                players: Object.values(tournament.players), // Send full player objects
                playerCount: Object.keys(tournament.players).length,
              }
            : null,
        });

        // Update all players with new tournament data
        const allPlayers = PlayerManager.instance.getConnectedPlayers();
        allPlayers.forEach((p) => {
          p.ui.sendData({
            type: "tournament-list-updated",
            tournaments: this.deps.tournamentManager.getActiveTournaments().map((t) => ({
              id: t.id,
              name: t.name,
              type: t.type,
              gameMode: t.gameMode,
              maxPlayers: t.maxPlayers,
              status: t.status,
              players: Object.keys(t.players).length,
            })),
          });
        });

        logger.info(`Player ${player.username} joined tournament successfully`);
      } else {
        player.ui.sendData({
          type: "tournament-error",
          message: "Failed to join tournament. It may be full or already started.",
        });
      }
    } catch (error: any) {
      logger.error("Tournament join error:", error);
      player.ui.sendData({
        type: "tournament-error",
        message: `Failed to join tournament: ${error.message}`,
      });
    }
  }

  /**
   * Handle tournament leave
   */
  handleTournamentLeave(player: Player, data: any): void {
    logger.info(`Player ${player.username} leaving tournament`);

    const activeTournaments = this.deps.tournamentManager.getPlayerActiveTournaments(
      player.username
    );

    if (activeTournaments.length > 0) {
      const tournament = activeTournaments[0];

      try {
        const success = this.deps.tournamentManager.unregisterPlayer(tournament.id, player.username);

        if (success) {
          player.ui.sendData({
            type: "tournament-left",
            message: `Left tournament "${tournament.name}"`,
          });

          // Update all players with new tournament data
          const allPlayers = PlayerManager.instance.getConnectedPlayers();
          allPlayers.forEach((p) => {
            p.ui.sendData({
              type: "tournament-list-updated",
              tournaments: this.deps.tournamentManager.getActiveTournaments().map((t) => ({
                id: t.id,
                name: t.name,
                type: t.type,
                gameMode: t.gameMode,
                maxPlayers: t.maxPlayers,
                status: t.status,
                players: Object.keys(t.players).length,
              })),
            });
          });

          logger.info(`Player ${player.username} left tournament successfully`);
        } else {
          player.ui.sendData({
            type: "tournament-error",
            message: "Failed to leave tournament",
          });
        }
      } catch (error: any) {
        logger.error("Tournament leave error:", error);
        player.ui.sendData({
          type: "tournament-error",
          message: `Failed to leave tournament: ${error.message}`,
        });
      }
    } else {
      player.ui.sendData({
        type: "tournament-error",
        message: "You are not in any tournaments",
      });
    }
  }

  /**
   * Handle tournament ready
   */
  handleTournamentReady(player: Player, data: any): void {
    logger.info(`Player ${player.username} marking ready for tournament match`);

    const match = this.deps.tournamentManager.getMatchForPlayer(player.username);
    if (match) {
      try {
        // Find the tournament this match belongs to
        const tournament = this.deps.tournamentManager
          .getActiveTournaments()
          .find((t) => t.bracket.some((m) => m.id === match.id));

        if (tournament) {
          const success = this.deps.tournamentManager.setPlayerReady(
            tournament.id,
            match.id,
            player.username,
            true
          );

          if (success) {
            player.ui.sendData({
              type: "tournament-ready-updated",
              isReady: true,
              message: "Marked as ready for match!",
            });

            logger.info(`Player ${player.username} marked as ready for match`);
          } else {
            player.ui.sendData({
              type: "tournament-error",
              message: "Failed to mark as ready",
            });
          }
        } else {
          player.ui.sendData({
            type: "tournament-error",
            message: "Tournament not found for match",
          });
        }
      } catch (error: any) {
        logger.error("Tournament ready error:", error);
        player.ui.sendData({
          type: "tournament-error",
          message: `Failed to set ready status: ${error.message}`,
        });
      }
    } else {
      player.ui.sendData({
        type: "tournament-error",
        message: "You don't have any upcoming matches",
      });
    }
  }

  /**
   * Handle tournament get status
   */
  handleTournamentGetStatus(player: Player, data: any): void {
    logger.info(`Player ${player.username} requesting tournament status`);

    const activeTournaments = this.deps.tournamentManager.getPlayerActiveTournaments(
      player.username
    );

    if (activeTournaments.length > 0) {
      const tournament = activeTournaments[0];
      const match = this.deps.tournamentManager.getMatchForPlayer(player.username);

      player.ui.sendData({
        type: "tournament-status",
        tournament: {
          id: tournament.id,
          name: tournament.name,
          type: tournament.type,
          gameMode: tournament.gameMode,
          maxPlayers: tournament.maxPlayers,
          status: tournament.status,
          players: Object.keys(tournament.players),
          playerCount: Object.keys(tournament.players).length,
          bracket: tournament.bracket,
        },
        playerMatch: match
          ? {
              id: match.id,
              opponent: match.player1 === player.username ? match.player2 : match.player1,
              status: match.status,
              roundNumber: match.roundNumber,
              scheduledTime: match.scheduledTime,
            }
          : null,
      });
    } else {
      player.ui.sendData({
        type: "tournament-status",
        tournament: null,
        playerMatch: null,
      });
    }
  }

  /**
   * Handle tournament get list
   */
  handleTournamentGetList(player: Player, data: any): void {
    logger.info(`Player ${player.username} requesting tournament list`);

    const tournaments = this.deps.tournamentManager.getActiveTournaments();

    player.ui.sendData({
      type: "tournament-list",
      tournaments: tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        gameMode: t.gameMode,
        maxPlayers: t.maxPlayers,
        status: t.status,
        players: Object.keys(t.players).length,
        createdBy: t.createdBy,
        registrationDeadline: t.registrationDeadline,
      })),
    });
  }
}
