// Audio effect management for arcade mode

import { Audio, World, type Vector3Like } from "hytopia";
import SoccerPlayerEntity from "../../entities/SoccerPlayerEntity";

export class ArcadeAudioEffects {
  private world: World;

  constructor(world: World) {
    this.world = world;
    console.log("ArcadeAudioEffects initialized");
  }

  /**
   * Safe audio creation method to prevent crashes from missing files
   * @param uri - Audio file URI
   * @param options - Audio options
   * @returns Audio object or null if creation failed
   */
  safeCreateAudio(uri: string, options: any = {}): Audio | null {
    try {
      // Basic validation of audio URI format
      if (!uri || typeof uri !== 'string' || !uri.startsWith('audio/')) {
        console.warn(`⚠️ Invalid audio URI format: ${uri}`);
        return null;
      }

      const audioOptions = {
        uri: uri,
        loop: false,
        volume: 0.5,
        ...options
      };

      const audio = new Audio(audioOptions);
      return audio;
    } catch (error) {
      console.error(`❌ Failed to create audio for URI: ${uri}`, error);
      return null;
    }
  }

  /**
   * Safe audio play method
   * @param audio - Audio object to play
   * @param world - World instance
   * @returns True if successful
   */
  safePlayAudio(audio: Audio | null, world: any): boolean {
    if (!audio) {
      console.warn("⚠️ Cannot play null audio object");
      return false;
    }

    try {
      audio.play(world);
      return true;
    } catch (error) {
      console.error("❌ Failed to play audio:", error);
      return false;
    }
  }

  /**
   * Play power-up activation sound
   * @param position - Position to play sound at
   * @param powerUpType - Type of power-up
   */
  playPowerUpSound(position: Vector3Like, powerUpType: string): void {
    const audio = new Audio({
      uri: "audio/sfx/ui/inventory-grab-item.mp3",
      loop: false,
      volume: 0.5,
      position: position,
      referenceDistance: 10
    });
    audio.play(this.world);
  }

  /**
   * Play freeze effect sound
   * @param position - Position to play sound at
   */
  playFreezeSound(position: Vector3Like): void {
    const freezeAudio = new Audio({
      uri: "audio/sfx/liquid/large-splash.mp3",
      loop: false,
      volume: 0.6,
      position: position,
      referenceDistance: 15
    });
    freezeAudio.play(this.world);

    // Add ice crystallization sound
    setTimeout(() => {
      const crystalAudio = new Audio({
        uri: "audio/sfx/damage/glass-break-3.mp3",
        loop: false,
        volume: 0.4,
        position: position,
        referenceDistance: 12
      });
      crystalAudio.play(this.world);
    }, 150);

    // Add whoosh sound for cold wind
    const windAudio = new Audio({
      uri: "audio/sfx/ui/portal-travel-woosh.mp3",
      loop: false,
      volume: 0.3,
      position: position,
      referenceDistance: 18
    });
    windAudio.play(this.world);
  }

  /**
   * Play fireball launch sound
   * @param position - Position to play sound at
   */
  playFireballSound(position: Vector3Like): void {
    const launchAudio = this.safeCreateAudio("audio/sfx/fire/fire-ignite.mp3", {
      loop: false,
      volume: 0.8,
      position: position,
      referenceDistance: 15
    });
    this.safePlayAudio(launchAudio, this.world);
  }

  /**
   * Play explosion sound
   * @param position - Position to play sound at
   */
  playExplosionSound(position: Vector3Like): void {
    const explosionAudio = new Audio({
      uri: "audio/sfx/damage/explode.mp3",
      loop: false,
      volume: 1.0,
      position: position,
      referenceDistance: 25
    });
    explosionAudio.play(this.world);

    // Add thunder effect
    setTimeout(() => {
      const thunderAudio = new Audio({
        uri: "audio/sfx/weather/thunder-strike-1.mp3",
        loop: false,
        volume: 0.7,
        position: position,
        referenceDistance: 30
      });
      thunderAudio.play(this.world);
    }, 200);
  }

  /**
   * Play speed boost sound
   * @param position - Position to play sound at
   */
  playSpeedBoostSound(position: Vector3Like): void {
    const whooshAudio = new Audio({
      uri: "audio/sfx/ui/portal-travel-woosh.mp3",
      loop: false,
      volume: 0.8,
      position: position,
      referenceDistance: 10
    });
    whooshAudio.play(this.world);

    setTimeout(() => {
      const windAudio = new Audio({
        uri: "audio/sfx/ambient/weather/thunder/thunder-strike-1.mp3",
        loop: false,
        volume: 0.2,
        position: position,
        referenceDistance: 10
      });
      windAudio.play(this.world);
    }, 200);
  }

  /**
   * Play shield activation sound
   * @param position - Position to play sound at
   */
  playShieldSound(position: Vector3Like): void {
    const shieldAudio = new Audio({
      uri: "audio/sfx/damage/hit-metal-3.mp3",
      loop: false,
      volume: 0.7,
      position: position,
      referenceDistance: 10
    });
    shieldAudio.play(this.world);

    setTimeout(() => {
      const humAudio = new Audio({
        uri: "audio/sfx/ui/portal-teleporting-long.mp3",
        loop: false,
        volume: 0.3,
        position: position,
        referenceDistance: 10
      });
      humAudio.play(this.world);
    }, 200);
  }

  /**
   * Play charging sound effect
   * @param player - Player activating power-up
   * @param powerUpType - Type of power-up
   */
  playChargingSound(player: SoccerPlayerEntity, powerUpType: string): void {
    const chargeSounds: Record<string, string> = {
      'freeze_blast': 'audio/sfx/liquid/large-splash-2.mp3',
      'fireball': 'audio/sfx/fire/fire-ignite-2.mp3',
      'shuriken': 'audio/sfx/ui/button-click.mp3',
      'mega_kick': 'audio/sfx/soccer/ball-kick-03.mp3',
      'shield': 'audio/sfx/damage/glass-break-1.mp3',
      'speed_boost': 'audio/sfx/ui/portal-travel-woosh.mp3',
      'default': 'audio/sfx/ui/inventory-place-item.mp3'
    };

    const soundUri = chargeSounds[powerUpType] || chargeSounds['default'];

    const chargeAudio = new Audio({
      uri: soundUri,
      loop: false,
      volume: 0.6,
      position: player.position,
      referenceDistance: 10
    });
    chargeAudio.play(this.world);
  }
}
