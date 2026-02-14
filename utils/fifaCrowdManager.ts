import { Audio, World } from "hytopia";
import { isFIFAMode } from "../state/gameModes";

// Node.js Timer type
type Timer = ReturnType<typeof setTimeout>;

// ========== CONFIGURABLE CONSTANTS ==========

/** Default duration estimate for announcer clips (ms). Used when actual clip duration is unknown. */
const DEFAULT_ANNOUNCER_DURATION_MS = 5000;

/**
 * Per-type announcer duration estimates (ms).
 * More specific estimates prevent cutting off long clips or leaving excessive gaps.
 */
const ANNOUNCER_DURATION_ESTIMATES: Record<string, number> = {
  "goal": 4000,
  "near-miss": 3000,
  "save": 3500,
  "momentum": 3500,
  "red-card": 4000,
  "game-end": 5000,
  "game-start": 4500,
};

/** Maximum number of pooled Audio objects for crowd reactions */
const AUDIO_POOL_MAX_SIZE = 8;

/**
 * FIFA Crowd Manager - Creates realistic stadium atmosphere for FIFA mode
 * Handles ambient crowd noise, event-triggered reactions, random chants, and announcer commentary
 */
export class FIFACrowdManager {
  private world: World;
  private ambientAudio: Audio | null = null;
  private chantInterval: Timer | null = null;
  private isActive: boolean = false;

  // Voice management system to prevent overlapping announcer audio
  private currentAnnouncerAudio: Audio | null = null;
  private isAnnouncerSpeaking: boolean = false;
  private announcerQueue: Array<{
    type: string;
    audioUri: string;
    priority: number;
    volume: number;
  }> = [];
  private queueProcessorInterval: Timer | null = null;

  // Audio object pool for crowd reaction sounds (avoids creating new Audio() every time)
  private audioPool: Audio[] = [];
  
  // Audio collections based on available files
  private crowdSounds = {
    ambient: [
      "audio/sfx/crowd/ambient/Echoto Sound - English Sports Crowd - Liverpool Football Stadium Ambience Cheering Clapping Chanting.wav",
      "audio/sfx/crowd/ambient/Sonic Bat - Soccer Stadium - Crowd Chanting Clapping Rhythmically.wav"
    ],
    chants: [
      "audio/sfx/crowd/chants/Stringer Sound - Ultras - Crowd Chanting Ecstatic.wav",
      "audio/sfx/crowd/chants/Sonic Bat - Soccer Stadium - Announcer Speaking Crowd Reacting Shouting.wav",
      "audio/sfx/crowd/chants/EVG Sound FX - Loyal Fans - Soccer Fans Melodic Chanting.wav"
    ],
    reactions: {
      goalCheer: "audio/sfx/crowd/reactions/Stringer Sound - Ultras - Crowd Cheers Clapping Goal Reaction.wav",
      applause: "audio/sfx/crowd/reactions/Airborne Sound - Reaction - Soccer - Cheer and Applause - Medium Distant.wav",
      foulReaction: "audio/sfx/crowd/reactions/Stringer Sound - Soccer Game - Football Crowd Ambience Crowd Foul Reaction Angry Upset.wav",
      mixedReaction: "audio/sfx/crowd/reactions/Sonic Bat - Soccer Stadium - Crowd Cheering Short Whistles Light Booing .wav"
    },
    announcer: {
      gameStart: [
        "audio/sfx/crowd/announcer/Notable Voices - Soccer Commentator - Game Start.wav"
      ],
      goals: [
        "audio/sfx/crowd/announcer/Notable Voices - Soccer Commentator - What a Goal Excited.wav",
        "audio/sfx/crowd/announcer/Notable Voices - Soccer Commentator - What a Beauty.wav",
        "audio/sfx/crowd/announcer/Notable Voices - Soccer Commentator - Crowd Goes Wild.wav",
        "audio/sfx/crowd/announcer/Apple Hill Studios - Sports Announcer - Play By Play What A Shot .wav"
      ],
      saves: [
        "audio/sfx/crowd/announcer/Notable Voices - Soccer Commentator - Reaction Beautiful Save.wav"
      ],
      nearMiss: [
        "audio/sfx/crowd/announcer/Notable Voices - Soccer Commentator - So Close Frustrated .wav",
        "audio/sfx/crowd/announcer/Notable Voices - Soccer Commentator - Reaction Near Miss.wav"
      ],
      momentum: [
        "audio/sfx/crowd/announcer/Apple Hill Studios - Sports Announcer - Play By Play Hes On Fire Now.wav",
        "audio/sfx/crowd/announcer/Apple Hill Studios - Sports Announcer - Play By Play Hes On A Roll .wav"
      ],
      gameEnd: [
        "audio/sfx/crowd/announcer/Apple Hill Studios - Sports Announcer - Play By Play Its All Over .wav"
      ],
      redCard: [
        "audio/sfx/crowd/announcer/Notable Voices - Soccer Commentator - Red Card.wav"
      ]
    }
  };

  constructor(world: World) {
    this.world = world;
    // console.log("FIFA Crowd Manager initialized");
    
    // Start the announcer queue processor
    this.startQueueProcessor();
  }

  /**
   * Start the FIFA crowd atmosphere system
   * Only activates if currently in FIFA mode
   */
  public start(): void {
    if (!isFIFAMode()) {
      // console.log("FIFA Crowd Manager: Not in FIFA mode, skipping activation");
      return;
    }

    if (this.isActive) {
      // console.log("FIFA Crowd Manager: Already active");
      return;
    }

    this.isActive = true;
    // console.log("🏟️ Starting FIFA stadium crowd atmosphere");

    // Restart queue processor if it was stopped
    if (!this.queueProcessorInterval) {
      this.startQueueProcessor();
    }

    // Start ambient crowd noise
    this.startAmbientCrowd();

    // Start random chants system
    this.startRandomChants();
  }

  /**
   * Stop the FIFA crowd atmosphere system
   */
  public stop(): void {
    if (!this.isActive) return;

    // console.log("🔇 Stopping FIFA stadium crowd atmosphere");
    this.isActive = false;

    // Stop ambient audio
    if (this.ambientAudio) {
      this.ambientAudio.pause();
      this.ambientAudio = null;
    }

    // Stop chant timer
    if (this.chantInterval) {
      clearTimeout(this.chantInterval);
      this.chantInterval = null;
    }
    
    // Stop current announcer audio and clear queue
    if (this.currentAnnouncerAudio) {
      this.currentAnnouncerAudio.pause();
      this.currentAnnouncerAudio = null;
    }
    this.isAnnouncerSpeaking = false;
    this.announcerQueue = [];

    // Stop queue processor to prevent memory leak
    if (this.queueProcessorInterval) {
      clearInterval(this.queueProcessorInterval);
      this.queueProcessorInterval = null;
    }

    // Drain the audio object pool
    for (const audio of this.audioPool) {
      audio.pause();
    }
    this.audioPool = [];
  }

  /**
   * Start continuous ambient crowd noise
   */
  private startAmbientCrowd(): void {
    // Rotate through ambient tracks for variety
    const randomAmbient = this.getRandomSound(this.crowdSounds.ambient);
    
    this.ambientAudio = new Audio({
      uri: randomAmbient,
      loop: true,
      volume: 0.55, // Increased ambient crowd volume for better atmosphere
    });
    
    this.ambientAudio.play(this.world);
    // console.log(`🎵 Playing ambient crowd: ${randomAmbient.split('/').pop()}`);
  }

  /**
   * Start system for random crowd chants
   */
  private startRandomChants(): void {
    const playRandomChant = () => {
      if (!this.isActive || !isFIFAMode()) return;

      const randomChant = this.getRandomSound(this.crowdSounds.chants);
      
      const chantAudio = this.getPooledAudio(randomChant, 0.65);
      chantAudio.play(this.world);
      // Return to pool after estimated playback time
      setTimeout(() => this.returnToPool(chantAudio), 8000);
      // console.log(`📢 Playing crowd chant: ${randomChant.split('/').pop()}`);
    };

    // Play chants every 45-90 seconds for realistic intervals
    const scheduleNextChant = () => {
      if (!this.isActive) return;
      
      const nextInterval = 45000 + Math.random() * 45000; // 45-90 seconds
      this.chantInterval = setTimeout(() => {
        playRandomChant();
        scheduleNextChant();
      }, nextInterval);
    };

    // Start the chant cycle
    scheduleNextChant();
  }

  /**
   * Play crowd reaction to a goal
   */
  public playGoalReaction(): void {
    if (!this.isActive || !isFIFAMode()) return;

    // console.log("🥅 Playing FIFA crowd goal reaction");
    
    // Play crowd cheer (immediate, no queue needed for crowd sounds)
    const goalCheer = this.getPooledAudio(this.crowdSounds.reactions.goalCheer, 0.9);
    goalCheer.play(this.world);
    setTimeout(() => this.returnToPool(goalCheer), 6000);

    // Queue announcer commentary with high priority
    const randomAnnouncer = this.getRandomSound(this.crowdSounds.announcer.goals);
    this.queueAnnouncement("goal", randomAnnouncer, 100, 0.6); // Priority 100 = highest
  }

  /**
   * Play crowd reaction to a near miss or save
   */
  public playNearMissReaction(): void {
    if (!this.isActive || !isFIFAMode()) return;

    // console.log("😲 Playing FIFA crowd near miss reaction");
    
    // Play mixed reaction (gasps, applause)
    const reactionAudio = this.getPooledAudio(this.crowdSounds.reactions.mixedReaction, 0.65);
    reactionAudio.play(this.world);
    setTimeout(() => this.returnToPool(reactionAudio), 5000);

    // Sometimes add announcer commentary with medium priority
    if (Math.random() < 0.6) { // 60% chance
      const randomAnnouncer = this.getRandomSound(this.crowdSounds.announcer.nearMiss);
      this.queueAnnouncement("near-miss", randomAnnouncer, 60, 0.5); // Priority 60 = medium
    }
  }

  /**
   * Play save reaction with announcer commentary
   */
  public playSaveReaction(): void {
    if (!this.isActive || !isFIFAMode()) return;

    // console.log("🥅 Playing FIFA save reaction");
    
    // Play applause for good save
    const applauseAudio = this.getPooledAudio(this.crowdSounds.reactions.applause, 0.65);
    applauseAudio.play(this.world);
    setTimeout(() => this.returnToPool(applauseAudio), 5000);

    // Queue save commentary with medium-high priority
    const randomAnnouncer = this.getRandomSound(this.crowdSounds.announcer.saves);
    this.queueAnnouncement("save", randomAnnouncer, 70, 0.5); // Priority 70 = medium-high
  }

  /**
   * Play momentum building commentary (for streaks, great plays, etc.)
   */
  public playMomentumAnnouncement(): void {
    if (!this.isActive || !isFIFAMode()) return;

    // console.log("🔥 Playing FIFA momentum announcement");
    
    // Queue momentum commentary with high priority (but lower than goals)
    const randomAnnouncer = this.getRandomSound(this.crowdSounds.announcer.momentum);
    this.queueAnnouncement("momentum", randomAnnouncer, 90, 0.6); // Priority 90 = high
  }

  /**
   * Play red card announcement
   */
  public playRedCardAnnouncement(): void {
    if (!this.isActive || !isFIFAMode()) return;

    // console.log("🔴 Playing FIFA red card announcement");
    
    // Play foul reaction first
    const foulAudio = this.getPooledAudio(this.crowdSounds.reactions.foulReaction, 0.75);
    foulAudio.play(this.world);
    setTimeout(() => this.returnToPool(foulAudio), 5000);

    // Queue red card announcement with very high priority
    const randomAnnouncer = this.getRandomSound(this.crowdSounds.announcer.redCard);
    this.queueAnnouncement("red-card", randomAnnouncer, 95, 0.7); // Priority 95 = very high
  }

  /**
   * Play game end announcement
   */
  public playGameEndAnnouncement(): void {
    if (!this.isActive || !isFIFAMode()) return;

    // console.log("🏁 Playing FIFA game end announcement");
    
    // Queue game end announcement with highest priority
    const randomAnnouncer = this.getRandomSound(this.crowdSounds.announcer.gameEnd);
    this.queueAnnouncement("game-end", randomAnnouncer, 110, 0.7); // Priority 110 = maximum
  }

  /**
   * Play crowd reaction to fouls or controversial moments
   */
  public playFoulReaction(): void {
    if (!this.isActive || !isFIFAMode()) return;

    // console.log("😠 Playing FIFA crowd foul reaction");

    const foulAudio2 = this.getPooledAudio(this.crowdSounds.reactions.foulReaction, 0.7);
    foulAudio2.play(this.world);
    setTimeout(() => this.returnToPool(foulAudio2), 5000);
  }

  /**
   * Play game start announcement
   */
  public playGameStart(): void {
    if (!this.isActive || !isFIFAMode()) return;

    // console.log("🏁 Playing FIFA game start announcement");
    
    // Queue game start announcement with very high priority
    const randomAnnouncer = this.getRandomSound(this.crowdSounds.announcer.gameStart);
    this.queueAnnouncement("game-start", randomAnnouncer, 105, 0.7); // Priority 105 = very high
  }

  /**
   * Play general applause for good plays
   */
  public playApplause(): void {
    if (!this.isActive || !isFIFAMode()) return;

    const applauseAudio2 = this.getPooledAudio(this.crowdSounds.reactions.applause, 0.6);
    applauseAudio2.play(this.world);
    setTimeout(() => this.returnToPool(applauseAudio2), 5000);
  }

  /**
   * Get a random sound from an array of sound paths
   */
  private getRandomSound(soundArray: string[]): string {
    return soundArray[Math.floor(Math.random() * soundArray.length)];
  }

  /**
   * Check if the crowd manager is currently active
   */
  public isActivated(): boolean {
    return this.isActive;
  }

  /**
   * Check if an announcer is currently speaking
   */
  public isAnnouncerBusy(): boolean {
    return this.isAnnouncerSpeaking;
  }

  /**
   * Get the current announcer queue status
   */
  public getQueueStatus(): { queueLength: number; isPlaying: boolean; currentType?: string } {
    return {
      queueLength: this.announcerQueue.length,
      isPlaying: this.isAnnouncerSpeaking,
      currentType: this.isAnnouncerSpeaking ? "announcer-speaking" : undefined
    };
  }

  /**
   * Clear the announcer queue (for testing/debugging)
   */
  public clearAnnouncerQueue(): void {
    // console.log(`🎙️ Clearing announcer queue (${this.announcerQueue.length} items)`);
    this.announcerQueue = [];
    
    // Also stop current announcer if playing
    if (this.currentAnnouncerAudio) {
      this.currentAnnouncerAudio.pause();
      this.currentAnnouncerAudio = null;
      this.isAnnouncerSpeaking = false;
      // console.log(`🎙️ Stopped current announcer audio`);
    }
  }

  /**
   * Start the announcer queue processor to manage voice overlap
   */
  private startQueueProcessor(): void {
    this.queueProcessorInterval = setInterval(() => {
      this.processAnnouncerQueue();
    }, 500); // Check every 500ms
  }

  /**
   * Process the announcer queue to ensure only one voice plays at a time
   */
  private processAnnouncerQueue(): void {
    // If announcer is currently speaking, wait
    if (this.isAnnouncerSpeaking) {
      return;
    }

    // If queue is empty, nothing to do
    if (this.announcerQueue.length === 0) {
      return;
    }

    // Sort queue by priority (higher number = higher priority)
    this.announcerQueue.sort((a, b) => b.priority - a.priority);

    // Get the highest priority announcement
    const nextAnnouncement = this.announcerQueue.shift();
    if (!nextAnnouncement) return;

    // console.log(`🎙️ Playing queued announcer: ${nextAnnouncement.type} - ${nextAnnouncement.audioUri.split('/').pop()}`);

    // Play the announcement with type-based duration estimate
    this.playAnnouncerAudio(nextAnnouncement.audioUri, nextAnnouncement.volume, nextAnnouncement.type);
  }

  /**
   * Add an announcement to the queue
   */
  private queueAnnouncement(type: string, audioUri: string, priority: number, volume: number = 1.0): void {
    if (!this.isActive || !isFIFAMode()) return;

    // Remove any duplicate announcements of the same type to prevent spam
    this.announcerQueue = this.announcerQueue.filter(item => item.type !== type);

    // Add new announcement
    this.announcerQueue.push({
      type,
      audioUri,
      priority,
      volume
    });

    // console.log(`📋 Queued announcer: ${type} (Priority: ${priority}, Queue size: ${this.announcerQueue.length})`);
  }

  /**
   * Play announcer audio and track when it finishes.
   * Uses per-type duration estimates to avoid cutting clips short or leaving excessive gaps.
   */
  private playAnnouncerAudio(audioUri: string, volume: number, announcerType?: string): void {
    this.isAnnouncerSpeaking = true;

    this.currentAnnouncerAudio = new Audio({
      uri: audioUri,
      loop: false,
      volume: volume,
    });

    this.currentAnnouncerAudio.play(this.world);

    // Use per-type duration estimate, falling back to the default constant
    const estimatedDuration = (announcerType && ANNOUNCER_DURATION_ESTIMATES[announcerType])
      ? ANNOUNCER_DURATION_ESTIMATES[announcerType]
      : DEFAULT_ANNOUNCER_DURATION_MS;

    setTimeout(() => {
      this.isAnnouncerSpeaking = false;
      this.currentAnnouncerAudio = null;
      // console.log(`🎙️ Announcer finished speaking`);
    }, estimatedDuration);
  }

  /**
   * Get or create a pooled Audio object for one-shot crowd/reaction sounds.
   * Reuses existing Audio objects to reduce garbage collection pressure.
   */
  private getPooledAudio(uri: string, volume: number, loop: boolean = false): Audio {
    // Try to reuse an existing pooled audio object
    if (this.audioPool.length > 0) {
      this.audioPool.pop(); // discard old instance (properties are read-only in new SDK)
      return new Audio({ uri, volume, loop });
    }

    // Create a new Audio object when pool is empty
    return new Audio({ uri, volume, loop });
  }

  /**
   * Return an Audio object to the pool for reuse.
   * If pool is full, the object is simply discarded.
   */
  private returnToPool(audio: Audio): void {
    if (this.audioPool.length < AUDIO_POOL_MAX_SIZE) {
      audio.pause();
      this.audioPool.push(audio);
    }
  }
} 