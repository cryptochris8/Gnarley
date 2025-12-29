/**
 * UIEventData
 *
 * Type-safe discriminated union types for all UI event data.
 * Eliminates the need for 'as any' casts when sending data to player UI.
 */

/**
 * All possible UI event types as a discriminated union
 */
export type UIEventData =
  | GameModeConfirmedEvent
  | SinglePlayerReadyEvent
  | SpectatorModeActiveEvent
  | ShowMobileControlsEvent
  | LoadingCompleteEvent
  | LoadingErrorEvent
  | LoadingProgressEvent
  | MultiplayerWaitingEvent
  | MultiplayerLobbyJoinedEvent
  | TeamAssignedEvent
  | MobileTeamSelectionConfirmedEvent
  | ActionFeedbackEvent
  | ErrorEvent
  | TournamentCreatedEvent
  | TournamentListUpdatedEvent
  | TournamentJoinedEvent
  | TournamentLeftEvent
  | TournamentReadyUpdatedEvent
  | TournamentStatusEvent
  | TournamentListEvent
  | TournamentErrorEvent
  | GameStateUpdateEvent
  | GameOverEvent
  | TeamCountsEvent
  | FocusOnInstructionsEvent
  | MobileActionFeedbackEvent
  | MobileCameraFeedbackEvent
  | MobileSwipeFeedbackEvent
  | MobileZoomFeedbackEvent;

// Game Mode Events
export interface GameModeConfirmedEvent {
  type: "game-mode-confirmed";
  mode: string;
}

export interface SinglePlayerReadyEvent {
  type: "single-player-ready";
  message: string;
}

// Spectator Events
export interface SpectatorModeActiveEvent {
  type: "spectator-mode-active";
  message: string;
}

// Mobile Events
export interface ShowMobileControlsEvent {
  type: "show-mobile-controls";
  message: string;
}

export interface MobileActionFeedbackEvent {
  type: "mobile-action-feedback";
  action: string;
  success: boolean;
  message?: string;
}

export interface MobileCameraFeedbackEvent {
  type: "mobile-camera-feedback";
  angle: string;
  message?: string;
}

export interface MobileSwipeFeedbackEvent {
  type: "mobile-swipe-feedback";
  direction: string;
  message?: string;
}

export interface MobileZoomFeedbackEvent {
  type: "mobile-zoom-feedback";
  level: number;
  message?: string;
}

export interface MobileTeamSelectionConfirmedEvent {
  type: "mobile-team-selection-confirmed";
  team: string;
}

// Loading Events
export interface LoadingCompleteEvent {
  type: "loading-complete";
}

export interface LoadingErrorEvent {
  type: "loading-error";
  message: string;
  error?: string;
}

export interface LoadingProgressEvent {
  type: "loading-progress";
  message: string;
  progress?: number;
}

// Multiplayer Events
export interface MultiplayerWaitingEvent {
  type: "multiplayer-waiting";
  message: string;
}

export interface MultiplayerLobbyJoinedEvent {
  type: "multiplayer-lobby-joined";
  lobbyId: string;
}

// Team Events
export interface TeamAssignedEvent {
  type: "team-assigned";
  team: "red" | "blue";
  message?: string;
}

export interface TeamCountsEvent {
  type: "team-counts";
  red: number;
  blue: number;
  maxPlayers: number;
  singlePlayerMode: boolean;
}

// Action Events
export interface ActionFeedbackEvent {
  type: "action-feedback";
  action: string;
  success: boolean;
  message?: string;
}

// Error Events
export interface ErrorEvent {
  type: "error";
  message: string;
  details?: string;
}

// Tournament Events
export interface TournamentCreatedEvent {
  type: "tournament-created";
  tournamentId: string;
  name: string;
  format: string;
}

export interface TournamentListUpdatedEvent {
  type: "tournament-list-updated";
  tournaments: Array<{
    id: string;
    name: string;
    format: string;
    players: number;
    maxPlayers: number;
    status: string;
  }>;
}

export interface TournamentJoinedEvent {
  type: "tournament-joined";
  tournamentId: string;
  playerSlot: number;
}

export interface TournamentLeftEvent {
  type: "tournament-left";
  tournamentId: string;
}

export interface TournamentReadyUpdatedEvent {
  type: "tournament-ready-updated";
  tournamentId: string;
  ready: boolean;
}

export interface TournamentStatusEvent {
  type: "tournament-status";
  tournamentId: string;
  status: string;
  currentMatch?: number;
  totalMatches?: number;
  bracket?: any;
}

export interface TournamentListEvent {
  type: "tournament-list";
  tournaments: Array<{
    id: string;
    name: string;
    format: string;
    players: number;
    maxPlayers: number;
    status: string;
  }>;
}

export interface TournamentErrorEvent {
  type: "tournament-error";
  message: string;
  code?: string;
}

// Game State Events
export interface GameStateUpdateEvent {
  type: "game-state-update";
  state: any; // Could be more specific based on actual game state
}

export interface GameOverEvent {
  type: "game-over";
  redScore: number;
  blueScore: number;
  playerStats: Array<{
    name: string;
    team: string;
    role: string;
    goals: number;
    tackles: number;
    passes: number;
    shots: number;
    saves: number;
    distanceTraveled: number;
  }>;
  teamStats: any;
  winner: string;
  matchDuration: number;
  wasOvertime: boolean;
}

export interface FocusOnInstructionsEvent {
  type: "focus-on-instructions";
}
