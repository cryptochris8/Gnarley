/**
 * AudioManager - Centralized music and audio management
 *
 * Manages all game music tracks including:
 * - Opening/menu music
 * - FIFA mode gameplay music
 * - Arcade mode gameplay music
 *
 * Ensures only one music track plays at a time and provides
 * clean transitions between different game states.
 *
 * @example
 * const audioManager = new AudioManager(world);
 * audioManager.playOpeningMusic();
 * // Later when game starts:
 * audioManager.playGameplayMusic('fifa');
 */

import { Audio, World } from "hytopia";
import { GameMode } from "../../state/gameModes";
import { logger } from "../../utils/GameLogger";

export class AudioManager {
  private mainMusic: Audio;
  private arcadeGameplayMusic: Audio;
  private fifaGameplayMusic: Audio;
  private currentlyPlaying: 'opening' | 'arcade' | 'fifa' | null = null;
  private world: World;

  constructor(world: World) {
    this.world = world;

    logger.info("<µ Initializing AudioManager...");

    // Create opening/menu music
    this.mainMusic = new Audio({
      uri: "audio/music/Ian%20Post%20-%208%20Bit%20Samba%20-%20No%20FX.mp3",
      loop: true,
      volume: 1.0, // Maximum volume for testing - can reduce if too loud
    });

    // Create arcade gameplay music
    this.arcadeGameplayMusic = new Audio({
      uri: "audio/music/always-win.mp3",
      loop: true,
      volume: 1.0, // Maximum volume for testing
    });

    // Create FIFA gameplay music
    this.fifaGameplayMusic = new Audio({
      uri: "audio/music/Vettore%20-%20Silk.mp3",
      loop: true,
      volume: 1.0, // Maximum volume for testing
    });

    logger.info(" AudioManager initialized with 3 music tracks");
    logger.debug("   - Opening: Ian Post - 8 Bit Samba");
    logger.debug("   - Arcade: Always Win");
    logger.debug("   - FIFA: Vettore - Silk");
  }

  /**
   * Stop all music tracks
   * Private method used before switching tracks
   */
  private stopAllMusic(): void {
    try {
      this.mainMusic.pause();
      this.arcadeGameplayMusic.pause();
      this.fifaGameplayMusic.pause();
      logger.debug("= All music tracks paused");
    } catch (error) {
      logger.error("Error stopping music:", error);
    }
  }

  /**
   * Play opening/menu music
   * Used for team selection, lobby, and pre-game screens
   *
   * @returns true if successful, false otherwise
   */
  playOpeningMusic(): boolean {
    if (this.currentlyPlaying === 'opening') {
      logger.debug("Opening music already playing, skipping");
      return true;
    }

    logger.info("<µ Starting opening music (8 Bit Samba)...");
    this.stopAllMusic();

    try {
      this.mainMusic.play(this.world);
      this.currentlyPlaying = 'opening';
      logger.info(" Opening music playing at volume 1.0");
      return true;
    } catch (error) {
      logger.error("L Failed to play opening music:", error);
      this.currentlyPlaying = null;
      return false;
    }
  }

  /**
   * Play gameplay music based on current game mode
   *
   * @param mode - Current game mode (fifa, arcade, or tournament)
   * @returns true if successful, false otherwise
   */
  playGameplayMusic(mode: GameMode): boolean {
    const trackType = mode === GameMode.FIFA || mode === GameMode.TOURNAMENT ? 'fifa' : 'arcade';

    if (this.currentlyPlaying === trackType) {
      logger.debug(`${trackType} music already playing, skipping`);
      return true;
    }

    const trackName = trackType === 'fifa' ? "Vettore - Silk" : "Always Win";
    logger.info(`<µ Starting gameplay music: ${trackName} (${mode} mode)...`);

    this.stopAllMusic();

    try {
      if (trackType === 'fifa') {
        this.fifaGameplayMusic.play(this.world);
      } else {
        this.arcadeGameplayMusic.play(this.world);
      }

      this.currentlyPlaying = trackType;
      logger.info(` Gameplay music (${trackName}) playing at volume 1.0`);
      return true;
    } catch (error) {
      logger.error(`L Failed to play gameplay music (${trackName}):`, error);
      this.currentlyPlaying = null;
      return false;
    }
  }

  /**
   * Get the currently playing music track
   */
  getCurrentTrack(): 'opening' | 'arcade' | 'fifa' | null {
    return this.currentlyPlaying;
  }

  /**
   * Check if music is currently playing
   */
  isPlaying(): boolean {
    return this.currentlyPlaying !== null;
  }

  /**
   * Stop all music (for cleanup or muting)
   */
  stopAll(): void {
    logger.info("= Stopping all music");
    this.stopAllMusic();
    this.currentlyPlaying = null;
  }

  /**
   * Set volume for all music tracks
   *
   * @param volume - Volume level (0.0 to 1.0)
   */
  setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));

    this.mainMusic.volume = clampedVolume;
    this.arcadeGameplayMusic.volume = clampedVolume;
    this.fifaGameplayMusic.volume = clampedVolume;

    logger.info(`=
 Music volume set to: ${clampedVolume.toFixed(2)}`);
  }

  /**
   * Get direct access to music objects (for advanced control)
   * Use sparingly - prefer using the manager methods
   */
  getMusicObjects(): {
    mainMusic: Audio;
    arcadeGameplayMusic: Audio;
    fifaGameplayMusic: Audio;
  } {
    return {
      mainMusic: this.mainMusic,
      arcadeGameplayMusic: this.arcadeGameplayMusic,
      fifaGameplayMusic: this.fifaGameplayMusic
    };
  }
}
