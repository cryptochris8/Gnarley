/**
 * Shared Hytopia SDK Mocks
 *
 * Reusable mock factories for Hytopia SDK types used across all test files.
 * Centralizes mock creation to avoid duplication and ensure consistency.
 */

import { vi } from 'vitest';

// ── Vector3Like mock ──────────────────────────────────────────────
export function createMockVector3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

// ── QuaternionLike mock ───────────────────────────────────────────
export function createMockQuaternion(x = 0, y = 0, z = 0, w = 1) {
  return { x, y, z, w };
}

// ── Player mock ───────────────────────────────────────────────────
export function createMockPlayer(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? `player-${Math.random().toString(36).slice(2, 8)}`,
    username: overrides.username ?? 'TestPlayer',
    ui: {
      sendData: vi.fn(),
      load: vi.fn(),
      lockPointer: vi.fn(),
    },
    camera: {
      facingDirection: createMockVector3(0, 0, -1),
      position: createMockVector3(0, 5, 0),
      orientation: { yaw: 0, pitch: 0 },
    },
    joinWorld: vi.fn(),
    getPersistedData: vi.fn().mockReturnValue({}),
    setPersistedData: vi.fn(),
    ...overrides,
  };
}

// ── Entity mock ───────────────────────────────────────────────────
export function createMockEntity(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? `entity-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name ?? 'MockEntity',
    position: overrides.position ?? createMockVector3(),
    rotation: overrides.rotation ?? createMockQuaternion(),
    linearVelocity: overrides.linearVelocity ?? createMockVector3(),
    angularVelocity: overrides.angularVelocity ?? createMockVector3(),
    isSpawned: overrides.isSpawned ?? true,
    world: overrides.world ?? createMockWorld(),
    player: overrides.player ?? null,
    mass: overrides.mass ?? 1.0,
    spawn: vi.fn(),
    despawn: vi.fn(),
    setPosition: vi.fn(),
    setRotation: vi.fn(),
    setLinearVelocity: vi.fn(),
    setAngularVelocity: vi.fn(),
    applyImpulse: vi.fn(),
    wakeUp: vi.fn(),
    getModelAnimation: vi.fn().mockReturnValue({
      play: vi.fn(),
      pause: vi.fn(),
      restart: vi.fn(),
      setLoopMode: vi.fn(),
      isPlaying: false,
    }),
    startModelLoopedAnimations: vi.fn(),
    startModelOneshotAnimations: vi.fn(),
    stopModelAnimations: vi.fn(),
    ...overrides,
  };
}

// ── World mock ────────────────────────────────────────────────────
export function createMockWorld(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? 'world-test',
    entityManager: {
      getAllEntities: vi.fn().mockReturnValue([]),
      getEntity: vi.fn(),
    },
    chatManager: {
      registerCommand: vi.fn(),
      sendPlayerMessage: vi.fn(),
      sendBroadcastMessage: vi.fn(),
    },
    simulation: {
      enableDebugRendering: vi.fn(),
    },
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    ...overrides,
  };
}

// ── Audio mock ────────────────────────────────────────────────────
export function createMockAudio() {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    setPlaybackRate: vi.fn(),
    setDetune: vi.fn(),
    uri: 'mock-audio.mp3',
  };
}

// ── Collider mock ────────────────────────────────────────────────
export function createMockCollider(overrides: Record<string, any> = {}) {
  return {
    shape: overrides.shape ?? 'BLOCK',
    halfExtents: overrides.halfExtents ?? { x: 1, y: 1, z: 1 },
    isSensor: overrides.isSensor ?? false,
    tag: overrides.tag ?? '',
    relativePosition: overrides.relativePosition ?? createMockVector3(),
    onCollision: overrides.onCollision ?? vi.fn(),
    addToSimulation: vi.fn(),
    removeFromSimulation: vi.fn(),
    ...overrides,
  };
}

// ── ParticleEmitter mock ─────────────────────────────────────────
export function createMockParticleEmitter(overrides: Record<string, any> = {}) {
  return {
    spawn: vi.fn(),
    despawn: vi.fn(),
    ...overrides,
  };
}

// ── SoccerPlayerEntity mock ──────────────────────────────────────
export function createMockSoccerPlayerEntity(overrides: Record<string, any> = {}) {
  const entity = createMockEntity({
    name: overrides.name ?? 'SoccerPlayer',
    ...overrides,
  });
  return {
    ...entity,
    team: overrides.team ?? 'red',
    isStunned: overrides.isStunned ?? false,
    isTackling: overrides.isTackling ?? false,
    player: overrides.player ?? createMockPlayer(),
    role: overrides.role ?? 'striker',
    setBallPossession: vi.fn(),
    getIncomingPassTarget: overrides.getIncomingPassTarget ?? vi.fn().mockReturnValue(null),
    clearIncomingPass: vi.fn(),
    ...overrides,
  };
}

// ── SharedState mock ─────────────────────────────────────────────
export function createMockSharedState(overrides: Record<string, any> = {}) {
  let attachedPlayer: any = null;
  let soccerBall: any = null;
  let ballHasMoved = false;
  let lastPlayerWithBall: any = null;

  return {
    getAttachedPlayer: vi.fn(() => attachedPlayer),
    setAttachedPlayer: vi.fn((player: any) => {
      if (player === null) {
        lastPlayerWithBall = attachedPlayer;
      }
      attachedPlayer = player;
    }),
    getSoccerBall: vi.fn(() => soccerBall),
    setSoccerBall: vi.fn((ball: any) => { soccerBall = ball; }),
    getBallHasMoved: vi.fn(() => ballHasMoved),
    setBallHasMoved: vi.fn(() => { ballHasMoved = true; }),
    resetBallMovementFlag: vi.fn(() => { ballHasMoved = false; }),
    getLastPlayerWithBall: vi.fn(() => lastPlayerWithBall),
    updateBallStationaryStatus: vi.fn(),
    resetBallStationaryStatus: vi.fn(),
    isBallStationary: vi.fn().mockReturnValue(false),
    getBallStationaryDuration: vi.fn().mockReturnValue(0),
    getTrackedBallPosition: vi.fn().mockReturnValue(null),
    setGameState: vi.fn(),
    getGameState: vi.fn().mockReturnValue(null),
    getRedAITeam: vi.fn().mockReturnValue([]),
    getBlueAITeam: vi.fn().mockReturnValue([]),
    setActivePlayer: vi.fn(),
    getActivePlayer: vi.fn().mockReturnValue(null),
    getRoomId: vi.fn().mockReturnValue('global'),
    ...overrides,
    // Allow tests to directly set state for verification
    _setAttachedPlayer: (p: any) => { attachedPlayer = p; },
    _setBallHasMoved: (v: boolean) => { ballHasMoved = v; },
  };
}

// ── Positioned entity (for SpatialGrid tests) ────────────────────
export function createPositionedEntity(x: number, y: number, z: number, id?: string) {
  return {
    position: createMockVector3(x, y, z),
    id: id ?? `entity-${x}-${y}-${z}`,
  };
}
