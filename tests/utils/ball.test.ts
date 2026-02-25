/**
 * Tests for utils/ball.ts — Soccer ball physics, goal detection, possession, and trails
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mock state (available in vi.mock factories) ─────────
const {
  mockSharedState,
  mockIsPenaltyShootoutMode,
  captured,
  listeners,
  ballRef,
} = vi.hoisted(() => {
  // Tracked attached player state (closured for getAttachedPlayer/setAttachedPlayer)
  let _attachedPlayer: any = null;
  let _ballHasMoved = false;

  const state = {
    getAttachedPlayer: vi.fn(() => _attachedPlayer),
    setAttachedPlayer: vi.fn((p: any) => { _attachedPlayer = p; }),
    getSoccerBall: vi.fn(),
    setSoccerBall: vi.fn(),
    getBallHasMoved: vi.fn(() => _ballHasMoved),
    setBallHasMoved: vi.fn(() => { _ballHasMoved = true; }),
    resetBallMovementFlag: vi.fn(),
    getLastPlayerWithBall: vi.fn().mockReturnValue(null),
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
    // Internal test helpers
    _setAttachedPlayer: (p: any) => { _attachedPlayer = p; },
    _setBallHasMoved: (v: boolean) => { _ballHasMoved = v; },
  };

  return {
    mockSharedState: state,
    mockIsPenaltyShootoutMode: vi.fn(() => false),
    captured: {
      entityConfigs: [] as any[],
      colliderConfigs: [] as any[],
      audioInstances: [] as any[],
      particleEmitters: [] as any[],
    },
    listeners: {
      entity: {} as Record<string, Function[]>,
      colliderOnCollision: {} as Record<string, Function>,
    },
    ballRef: { current: null as any },
  };
});

// ── SDK mock ────────────────────────────────────────────────────
vi.mock('hytopia', () => {
  // Use a real class so Entity.prototype works for instanceof checks
  class EntityClass {
    constructor(config: any) {
      captured.entityConfigs.push(config);
      const ent = ballRef.current;
      if (ent) {
        ent.spawn.mockImplementation(() => { ent.isSpawned = true; });
        ent.despawn.mockImplementation(() => { ent.isSpawned = false; });
      }
      return ent;
    }
  }

  class ColliderClass {
    constructor(config: any) {
      captured.colliderConfigs.push(config);
      if (config.tag && config.onCollision) {
        listeners.colliderOnCollision[config.tag] = config.onCollision;
      }
      return { addToSimulation: vi.fn(), removeFromSimulation: vi.fn(), ...config };
    }
  }

  class AudioClass {
    constructor(config: any) {
      const inst = { ...config, play: vi.fn(), pause: vi.fn(), stop: vi.fn() };
      captured.audioInstances.push(inst);
      return inst;
    }
  }

  class ParticleEmitterClass {
    constructor(config: any) {
      const inst = { ...config, spawn: vi.fn(), despawn: vi.fn() };
      captured.particleEmitters.push(inst);
      return inst;
    }
  }

  return {
    Entity: EntityClass,
    Collider: ColliderClass,
    Audio: AudioClass,
    ParticleEmitter: ParticleEmitterClass,
    World: vi.fn(),
    BlockType: class {},
    ColliderShape: { BALL: 'BALL', BLOCK: 'BLOCK' },
    RigidBodyType: { DYNAMIC: 'DYNAMIC', KINEMATIC_POSITION: 'KINEMATIC_POSITION', FIXED: 'FIXED' },
    EntityEvent: { ENTITY_COLLISION: 'entityCollision', BLOCK_COLLISION: 'blockCollision', TICK: 'tick' },
    CollisionGroup: { BLOCK: 1, ENTITY: 2, ENTITY_SENSOR: 4, ENVIRONMENT_ENTITY: 8, PLAYER: 16 },
    PlayerEntity: class {},
    BaseEntityController: class {},
    Vector3: { fromVector3Like: (v: any) => ({ ...v, normalize: () => v }) },
  };
});

vi.mock('../../state/sharedState', () => ({ default: mockSharedState }));
vi.mock('../../state/RoomSharedState', () => ({ RoomSharedState: vi.fn() }));
vi.mock('../../state/gameModes', () => ({ isPenaltyShootoutMode: mockIsPenaltyShootoutMode }));
vi.mock('../../state/map', () => ({
  soccerMap: {
    checkBoundaryDetails: vi.fn().mockReturnValue({ isOutOfBounds: false }),
    checkGoal: vi.fn().mockReturnValue(null),
    isOutOfBounds: vi.fn().mockReturnValue(false),
  },
}));
vi.mock('../../utils/direction', () => ({
  getDirectionFromRotation: vi.fn((rotation: any) => {
    const angle = 2 * Math.atan2(rotation.y, rotation.w);
    return { x: Math.sin(angle), y: 0, z: Math.cos(angle) };
  }),
}));
vi.mock('../../utils/EventThrottler', () => ({
  EventThrottler: { throttle: (fn: Function) => fn },
  default: { throttle: (fn: Function) => fn },
}));

// Mock SoccerPlayerEntity — we only need a class for instanceof checks
// This avoids importing the real module which pulls in complex SDK dependencies
vi.mock('../../entities/SoccerPlayerEntity', () => {
  class MockSoccerPlayerEntityClass {}
  return { default: MockSoccerPlayerEntityClass };
});

// ── Imports under test ──────────────────────────────────────────
import { createMockWorld, createMockEntity, createMockSoccerPlayerEntity } from '../__mocks__/hytopia';
import createSoccerBall, {
  updateBallTrail,
  cleanupBallTrail,
  setBallResetLockout,
  setPenaltyShootoutManager,
  _resetGoalDetectionState,
} from '../../utils/ball';
import SoccerPlayerEntity from '../../entities/SoccerPlayerEntity';
// Import Entity from the SAME mocked module that ball.ts uses,
// so instanceof checks in onCollision callbacks match correctly.
// Using require() inside helpers can return a different module reference in ESM mode.
import { Entity as MockedEntity } from 'hytopia';

// ── Helpers ─────────────────────────────────────────────────────
function createFreshBallEntity() {
  return {
    ...createMockEntity({
      name: 'SoccerBall',
      position: { x: 7, y: 6, z: -3 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      isSpawned: false,
    }),
    on: vi.fn((event: string, cb: Function) => {
      if (!listeners.entity[event]) listeners.entity[event] = [];
      listeners.entity[event].push(cb);
    }),
    off: vi.fn(),
  };
}

function fireEntityEvent(eventName: string, data: any) {
  for (const cb of listeners.entity[eventName] || []) cb(data);
}

function fireGoalSensor(tag: string, other: any, started: boolean) {
  listeners.colliderOnCollision[tag]?.(other, started);
}

/** Create a goal-ball entity that passes `instanceof Entity` */
function createGoalBallEntity(pos: { x: number; y: number; z: number }) {
  const e = Object.create(MockedEntity.prototype);
  // Define properties directly to avoid prototype getter conflicts
  Object.defineProperties(e, {
    name: { value: 'SoccerBall', writable: true, configurable: true },
    position: { value: pos, writable: true, configurable: true },
    isSpawned: { value: true, writable: true, configurable: true },
    despawn: { value: vi.fn(), writable: true, configurable: true },
    spawn: { value: vi.fn(), writable: true, configurable: true },
    setLinearVelocity: { value: vi.fn(), writable: true, configurable: true },
    setAngularVelocity: { value: vi.fn(), writable: true, configurable: true },
  });
  return e;
}

function makeSoccerPlayer(overrides: Record<string, any> = {}) {
  const p = createMockSoccerPlayerEntity(overrides);
  Object.setPrototypeOf(p, SoccerPlayerEntity.prototype);
  return p;
}

// ── Setup / teardown ────────────────────────────────────────────
let mockWorld: any;
const ball = () => ballRef.current; // shorthand accessor

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();

  captured.entityConfigs.length = 0;
  captured.colliderConfigs.length = 0;
  captured.audioInstances.length = 0;
  captured.particleEmitters.length = 0;
  for (const k of Object.keys(listeners.entity)) delete listeners.entity[k];
  for (const k of Object.keys(listeners.colliderOnCollision)) delete listeners.colliderOnCollision[k];

  mockSharedState._setAttachedPlayer(null);
  mockSharedState._setBallHasMoved(false);

  // Reset module-level goal detection state to prevent cross-test interference
  // (debounce/lockout timestamps from a previous test's fake clock can leak)
  _resetGoalDetectionState();

  ballRef.current = createFreshBallEntity();
  mockWorld = createMockWorld({
    entityManager: {
      getAllEntities: vi.fn().mockReturnValue([]),
      getAllPlayerEntities: vi.fn().mockReturnValue([]),
      getEntity: vi.fn(),
    },
  });
});

afterEach(() => {
  // Advance timers to clear all pending timeouts from previous test
  // This resets module-level state like ballHasEnteredGoal and goalSensorDebounce
  vi.advanceTimersByTime(5000);
  vi.useRealTimers();
});

// ═════════════════════════════════════════════════════════════════
// updateBallTrail
// ═════════════════════════════════════════════════════════════════
describe('updateBallTrail', () => {
  it('activates trail when speed > 8', () => {
    const b = createMockEntity({ isSpawned: true, linearVelocity: { x: 9, y: 0, z: 0 } });
    const w = createMockWorld();
    updateBallTrail(b as any, w as any);
    expect(captured.particleEmitters.length).toBe(1);
    expect(captured.particleEmitters[0].spawn).toHaveBeenCalledWith(w);
  });

  it('does not activate trail for slow ball', () => {
    const b = createMockEntity({ isSpawned: true, linearVelocity: { x: 3, y: 0, z: 0 } });
    updateBallTrail(b as any, createMockWorld() as any);
    expect(captured.particleEmitters.length).toBe(0);
  });

  it('deactivates trail with hysteresis (speed < threshold * 0.6)', () => {
    const b = createMockEntity({ isSpawned: true, linearVelocity: { x: 10, y: 0, z: 0 } });
    const w = createMockWorld();
    updateBallTrail(b as any, w as any);
    const emitter = captured.particleEmitters[0];

    b.linearVelocity = { x: 7, y: 0, z: 0 }; // 7 > 4.8 — still active
    updateBallTrail(b as any, w as any);
    expect(emitter.despawn).not.toHaveBeenCalled();

    b.linearVelocity = { x: 4, y: 0, z: 0 }; // 4 < 4.8 — deactivate
    updateBallTrail(b as any, w as any);
    expect(emitter.despawn).toHaveBeenCalled();
  });

  it('no-ops when ball is not spawned', () => {
    const b = createMockEntity({ isSpawned: false, linearVelocity: { x: 20, y: 0, z: 0 } });
    updateBallTrail(b as any, createMockWorld() as any);
    expect(captured.particleEmitters.length).toBe(0);
  });

  it('creates ParticleEmitter with fire texture', () => {
    const b = createMockEntity({ isSpawned: true, linearVelocity: { x: 10, y: 0, z: 0 } });
    updateBallTrail(b as any, createMockWorld() as any);
    expect(captured.particleEmitters[0].textureUri).toBe('textures/particles/fire.png');
  });

  it('does not create duplicate trail if already active', () => {
    // Ensure no prior trail state leaks
    cleanupBallTrail();
    captured.particleEmitters.length = 0;
    const b = createMockEntity({ isSpawned: true, linearVelocity: { x: 10, y: 0, z: 0 } });
    const w = createMockWorld();
    updateBallTrail(b as any, w as any);
    updateBallTrail(b as any, w as any);
    expect(captured.particleEmitters.length).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════
// cleanupBallTrail
// ═════════════════════════════════════════════════════════════════
describe('cleanupBallTrail', () => {
  it('despawns active trail emitter', () => {
    // Start fresh
    cleanupBallTrail();
    captured.particleEmitters.length = 0;
    const b = createMockEntity({ isSpawned: true, linearVelocity: { x: 10, y: 0, z: 0 } });
    updateBallTrail(b as any, createMockWorld() as any);
    expect(captured.particleEmitters.length).toBe(1);
    const emitter = captured.particleEmitters[0];
    cleanupBallTrail();
    expect(emitter.despawn).toHaveBeenCalled();
  });

  it('handles null emitter gracefully', () => {
    expect(() => cleanupBallTrail()).not.toThrow();
  });

  it('resets state so next fast ball re-creates trail', () => {
    const b = createMockEntity({ isSpawned: true, linearVelocity: { x: 10, y: 0, z: 0 } });
    const w = createMockWorld();
    updateBallTrail(b as any, w as any);
    cleanupBallTrail();
    captured.particleEmitters.length = 0;
    updateBallTrail(b as any, w as any);
    expect(captured.particleEmitters.length).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════
// setBallResetLockout
// ═════════════════════════════════════════════════════════════════
describe('setBallResetLockout', () => {
  it('prevents goal during lockout period', () => {
    createSoccerBall(mockWorld as any);
    vi.advanceTimersByTime(2500);
    mockWorld.emit.mockClear();

    setBallResetLockout();
    fireGoalSensor('red-goal-sensor', createGoalBallEntity({ x: 54, y: 2, z: -3 }), true);
    expect(mockWorld.emit).not.toHaveBeenCalled();
  });

  it('lockout expires after 1.5s', () => {
    createSoccerBall(mockWorld as any);
    vi.advanceTimersByTime(2500);
    mockWorld.emit.mockClear();

    setBallResetLockout();
    vi.advanceTimersByTime(1600);
    fireGoalSensor('red-goal-sensor', createGoalBallEntity({ x: 54, y: 2, z: -3 }), true);
    expect(mockWorld.emit).toHaveBeenCalledWith('goal', 'blue');
  });
});

// ═════════════════════════════════════════════════════════════════
// setPenaltyShootoutManager
// ═════════════════════════════════════════════════════════════════
describe('setPenaltyShootoutManager', () => {
  it('stores manager reference without error', () => {
    expect(() => setPenaltyShootoutManager({ handleShotResult: vi.fn() })).not.toThrow();
  });

  it('manager.handleShotResult called on goal in penalty mode', () => {
    const manager = { handleShotResult: vi.fn() };
    setPenaltyShootoutManager(manager);
    mockIsPenaltyShootoutMode.mockReturnValue(true);

    createSoccerBall(mockWorld as any);
    vi.advanceTimersByTime(2500);
    mockWorld.emit.mockClear();

    fireGoalSensor('red-goal-sensor', createGoalBallEntity({ x: 54, y: 2, z: -3 }), true);
    expect(manager.handleShotResult).toHaveBeenCalledWith('goal');
    expect(mockWorld.emit).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════
// createSoccerBall — construction
// ═════════════════════════════════════════════════════════════════
describe('createSoccerBall — construction', () => {
  it('returns an Entity object', () => {
    expect(createSoccerBall(mockWorld as any)).toBeDefined();
    expect(ball().name).toBe('SoccerBall');
  });

  it('calls setSoccerBall on shared state', () => {
    createSoccerBall(mockWorld as any);
    expect(mockSharedState.setSoccerBall).toHaveBeenCalled();
  });

  it('creates red and blue goal sensors', () => {
    createSoccerBall(mockWorld as any);
    expect(captured.colliderConfigs.length).toBe(2);
    expect(captured.colliderConfigs.map((c: any) => c.tag)).toEqual(
      expect.arrayContaining(['red-goal-sensor', 'blue-goal-sensor'])
    );
  });

  it('spawns ball at BALL_SPAWN_POSITION', () => {
    createSoccerBall(mockWorld as any);
    expect(ball().spawn).toHaveBeenCalledWith(mockWorld, { x: 7, y: 6, z: -3 });
  });

  it('registers ENTITY_COLLISION, BLOCK_COLLISION, and TICK listeners', () => {
    createSoccerBall(mockWorld as any);
    expect(ball().on).toHaveBeenCalledWith('entityCollision', expect.any(Function));
    expect(ball().on).toHaveBeenCalledWith('blockCollision', expect.any(Function));
    expect(ball().on).toHaveBeenCalledWith('tick', expect.any(Function));
  });

  it('sets initial velocities to zero and calls wakeUp', () => {
    createSoccerBall(mockWorld as any);
    expect(ball().setLinearVelocity).toHaveBeenCalledWith({ x: 0, y: 0, z: 0 });
    expect(ball().setAngularVelocity).toHaveBeenCalledWith({ x: 0, y: 0, z: 0 });
    expect(ball().wakeUp).toHaveBeenCalled();
  });

  it('goal sensors have onCollision callbacks registered', () => {
    createSoccerBall(mockWorld as any);
    expect(listeners.colliderOnCollision['red-goal-sensor']).toBeDefined();
    expect(listeners.colliderOnCollision['blue-goal-sensor']).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════
// createSoccerBall — goal detection
// ═════════════════════════════════════════════════════════════════
describe('createSoccerBall — goal detection', () => {
  function setup() {
    createSoccerBall(mockWorld as any);
    // Advance past init (1000ms), lockout (1500ms), and debounce (2000ms) — plus buffer
    vi.advanceTimersByTime(3000);
    mockWorld.emit.mockClear();
  }

  it('valid goal in red goal → blue team scores', () => {
    setup();
    fireGoalSensor('red-goal-sensor', createGoalBallEntity({ x: 54, y: 2, z: -3 }), true);
    expect(mockWorld.emit).toHaveBeenCalledWith('goal', 'blue');
  });

  it('valid goal in blue goal → red team scores', () => {
    setup();
    fireGoalSensor('blue-goal-sensor', createGoalBallEntity({ x: -39, y: 2, z: -3 }), true);
    expect(mockWorld.emit).toHaveBeenCalledWith('goal', 'red');
  });

  it('reset lockout rejects goal (< 1.5s)', () => {
    setup();
    setBallResetLockout();
    fireGoalSensor('red-goal-sensor', createGoalBallEntity({ x: 54, y: 2, z: -3 }), true);
    expect(mockWorld.emit).not.toHaveBeenCalled();
  });

  it('goal debounce prevents double goals', () => {
    setup();
    const gb = createGoalBallEntity({ x: 54, y: 2, z: -3 });
    fireGoalSensor('red-goal-sensor', gb, true);
    expect(mockWorld.emit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(500); // still within debounce window + ballHasEnteredGoal
    mockWorld.emit.mockClear();
    fireGoalSensor('red-goal-sensor', gb, true);
    expect(mockWorld.emit).not.toHaveBeenCalled();
  });

  it('ball attached to player prevents goal', () => {
    setup();
    mockSharedState._setAttachedPlayer(makeSoccerPlayer());
    fireGoalSensor('red-goal-sensor', createGoalBallEntity({ x: 54, y: 2, z: -3 }), true);
    expect(mockWorld.emit).not.toHaveBeenCalled();
  });

  it('ball outside Z bounds rejected', () => {
    setup();
    fireGoalSensor('red-goal-sensor', createGoalBallEntity({ x: 54, y: 2, z: -20 }), true);
    expect(mockWorld.emit).not.toHaveBeenCalled();
  });

  it('ball above crossbar rejected (Y > 4.5)', () => {
    setup();
    fireGoalSensor('red-goal-sensor', createGoalBallEntity({ x: 54, y: 5, z: -3 }), true);
    expect(mockWorld.emit).not.toHaveBeenCalled();
  });

  it('ball underground rejected (Y < -0.5)', () => {
    setup();
    fireGoalSensor('red-goal-sensor', createGoalBallEntity({ x: 54, y: -1, z: -3 }), true);
    expect(mockWorld.emit).not.toHaveBeenCalled();
  });

  it('penalty shootout mode calls manager instead of emit', () => {
    const mgr = { handleShotResult: vi.fn() };
    setPenaltyShootoutManager(mgr);
    mockIsPenaltyShootoutMode.mockReturnValue(true);
    setup();
    fireGoalSensor('red-goal-sensor', createGoalBallEntity({ x: 54, y: 2, z: -3 }), true);
    expect(mgr.handleShotResult).toHaveBeenCalledWith('goal');
    expect(mockWorld.emit).not.toHaveBeenCalled();
  });

  it('ball respawns at center after 1.5s delay', () => {
    setup();
    const gb = createGoalBallEntity({ x: 54, y: 2, z: -3 });
    fireGoalSensor('red-goal-sensor', gb, true);

    expect(gb.despawn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(gb.despawn).toHaveBeenCalled();
    expect(gb.spawn).toHaveBeenCalledWith(mockWorld, { x: 7, y: 6, z: -3 });
    expect(gb.setLinearVelocity).toHaveBeenCalledWith({ x: 0, y: 0, z: 0 });
  });

  it('sensor ignores non-SoccerBall entities', () => {
    setup();
    const other = createGoalBallEntity({ x: 54, y: 2, z: -3 });
    other.name = 'NotABall';
    fireGoalSensor('red-goal-sensor', other, true);
    expect(mockWorld.emit).not.toHaveBeenCalled();
  });

  it('sensor ignores collision end events (started=false)', () => {
    setup();
    fireGoalSensor('red-goal-sensor', createGoalBallEntity({ x: 54, y: 2, z: -3 }), false);
    expect(mockWorld.emit).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════
// createSoccerBall — collision handling
// ═════════════════════════════════════════════════════════════════
describe('createSoccerBall — collision handling', () => {
  function setup() {
    createSoccerBall(mockWorld as any);
    vi.advanceTimersByTime(2000);
  }

  it('loose ball attaches to non-stunned player on collision', () => {
    setup();
    const p = makeSoccerPlayer({ isStunned: false, team: 'red' });
    fireEntityEvent('entityCollision', { entity: ball(), otherEntity: p, started: true });
    expect(mockSharedState.setAttachedPlayer).toHaveBeenCalledWith(p);
  });

  it('stunned player does not get ball', () => {
    setup();
    const p = makeSoccerPlayer({ isStunned: true, team: 'red' });
    fireEntityEvent('entityCollision', { entity: ball(), otherEntity: p, started: true });
    expect(mockSharedState.setAttachedPlayer).not.toHaveBeenCalledWith(p);
  });

  it('tackling player steals ball and applies impulse', () => {
    setup();
    mockSharedState._setAttachedPlayer(makeSoccerPlayer({ team: 'red' }));
    const tackler = makeSoccerPlayer({ isTackling: true, team: 'blue', rotation: { x: 0, y: 0, z: 0, w: 1 } });

    fireEntityEvent('entityCollision', { entity: ball(), otherEntity: tackler, started: true });
    expect(mockSharedState.setAttachedPlayer).toHaveBeenCalledWith(null);
    expect(ball().applyImpulse).toHaveBeenCalled();
    expect(ball().setAngularVelocity).toHaveBeenCalledWith({ x: 0, y: 0, z: 0 });
  });

  it('teammate collision transfers possession', () => {
    setup();
    mockSharedState._setAttachedPlayer(makeSoccerPlayer({ team: 'red' }));
    const teammate = makeSoccerPlayer({ team: 'red' });
    fireEntityEvent('entityCollision', { entity: ball(), otherEntity: teammate, started: true });
    expect(mockSharedState.setAttachedPlayer).toHaveBeenCalledWith(teammate);
  });

  it('opponent collision without tackle does not transfer', () => {
    setup();
    mockSharedState._setAttachedPlayer(makeSoccerPlayer({ team: 'red' }));
    const opponent = makeSoccerPlayer({ team: 'blue', isTackling: false });
    mockSharedState.setAttachedPlayer.mockClear();
    fireEntityEvent('entityCollision', { entity: ball(), otherEntity: opponent, started: true });
    expect(mockSharedState.setAttachedPlayer).not.toHaveBeenCalled();
  });

  it('block collision applies damping (0.85x linear, abs(y)*0.6, 0.4x angular)', () => {
    setup();
    ball().linearVelocity = { x: 10, y: -5, z: 8 };
    ball().angularVelocity = { x: 2, y: 3, z: 1 };

    ball().setLinearVelocity.mockClear();
    ball().setAngularVelocity.mockClear();
    fireEntityEvent('blockCollision', { entity: ball(), blockType: {}, started: true });

    expect(ball().setLinearVelocity).toHaveBeenCalledWith({ x: 8.5, y: 3, z: 6.8 });
    // Check angular velocity was set with correct damping (0.4x)
    const angCall = ball().setAngularVelocity.mock.calls[0][0];
    expect(angCall.x).toBeCloseTo(0.8, 5);
    expect(angCall.y).toBeCloseTo(1.2, 5);
    expect(angCall.z).toBeCloseTo(0.4, 5);
  });

  it('block collision ignores ended events (started=false)', () => {
    setup();
    ball().setLinearVelocity.mockClear();
    fireEntityEvent('blockCollision', { entity: ball(), blockType: {}, started: false });
    expect(ball().setLinearVelocity).not.toHaveBeenCalled();
  });

  it('non-SoccerPlayerEntity collision is ignored', () => {
    setup();
    const normalEntity = createMockEntity({ name: 'SomeOtherEntity' });
    mockSharedState.setAttachedPlayer.mockClear();
    fireEntityEvent('entityCollision', { entity: ball(), otherEntity: normalEntity, started: true });
    expect(mockSharedState.setAttachedPlayer).not.toHaveBeenCalled();
  });

  it('entity collision with started=false is ignored', () => {
    setup();
    const p = makeSoccerPlayer();
    mockSharedState.setAttachedPlayer.mockClear();
    fireEntityEvent('entityCollision', { entity: ball(), otherEntity: p, started: false });
    expect(mockSharedState.setAttachedPlayer).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════
// createSoccerBall — tick logic
// ═════════════════════════════════════════════════════════════════
describe('createSoccerBall — tick logic', () => {
  function setup() {
    createSoccerBall(mockWorld as any);
    vi.advanceTimersByTime(1500);
    mockSharedState.setBallHasMoved.mockClear();
    mockSharedState.updateBallStationaryStatus.mockClear();
    ball().setPosition.mockClear();
    ball().setLinearVelocity.mockClear();
  }

  function tick() {
    fireEntityEvent('tick', { entity: ball(), tickDeltaMs: 16 });
  }

  it('detects ball movement from spawn (distance > 0.1)', () => {
    setup();
    ball().position = { x: 8, y: 6, z: -3 };
    tick();
    expect(mockSharedState.setBallHasMoved).toHaveBeenCalled();
  });

  it('does not flag movement for tiny jitter (< 0.1)', () => {
    setup();
    ball().position = { x: 7.05, y: 6, z: -3 };
    tick();
    expect(mockSharedState.setBallHasMoved).not.toHaveBeenCalled();
  });

  it('resets ball when below FIELD_MIN_Y + 0.5', () => {
    setup();
    ball().position = { x: 7, y: -1, z: -3 };
    tick();
    expect(ball().despawn).toHaveBeenCalled();
    expect(mockSharedState.setAttachedPlayer).toHaveBeenCalledWith(null);
    expect(ball().spawn).toHaveBeenCalledWith(mockWorld, { x: 7, y: 6, z: -3 });
  });

  it('teleport correction for position jumps > 10 units', () => {
    setup();
    ball().position = { x: 7, y: 6, z: -3 };
    for (let i = 0; i < 5; i++) tick(); // establish lastPosition
    ball().setPosition.mockClear();

    ball().position = { x: 20, y: 6, z: -3 }; // 13 unit jump
    for (let i = 0; i < 5; i++) tick(); // trigger position check

    const calls = ball().setPosition.mock.calls;
    const hasLerp = calls.some((c: any[]) => c[0].x > 7 && c[0].x < 20);
    expect(hasLerp).toBe(true);
  });

  it('proximity possession: nearest player within 3.5 units gets ball', () => {
    setup();
    ball().position = { x: 7, y: 6, z: -3 };
    ball().linearVelocity = { x: 0.5, y: 0, z: 0 };

    const p = makeSoccerPlayer({ position: { x: 8, y: 6, z: -3 }, isSpawned: true, isStunned: false });
    mockWorld.entityManager.getAllPlayerEntities.mockReturnValue([p]);

    tick();
    expect(mockSharedState.setAttachedPlayer).toHaveBeenCalledWith(p);
  });

  it('magnetic pass reception within 6.0 units for pass targets', () => {
    setup();
    ball().position = { x: 7, y: 6, z: -3 };
    ball().linearVelocity = { x: 3, y: 0, z: 0 };

    const passTarget = makeSoccerPlayer({
      position: { x: 12.5, y: 6, z: -3 }, // 5.5 units
      isSpawned: true,
      isStunned: false,
      getIncomingPassTarget: vi.fn().mockReturnValue({ x: 12, y: 6, z: -3 }),
    });
    mockWorld.entityManager.getAllPlayerEntities.mockReturnValue([passTarget]);

    tick();
    expect(mockSharedState.setAttachedPlayer).toHaveBeenCalledWith(passTarget);
  });

  it('reception assistance: ball moving toward player reduces effective distance', () => {
    setup();
    ball().position = { x: 7, y: 6, z: -3 };
    ball().linearVelocity = { x: 5, y: 0, z: 0 }; // moving +X

    // 4 units in X (outside base 3.5 but within assisted range of 4.5)
    const p = makeSoccerPlayer({
      position: { x: 11, y: 6, z: -3 },
      isSpawned: true,
      isStunned: false,
      getIncomingPassTarget: vi.fn().mockReturnValue(null),
    });
    mockWorld.entityManager.getAllPlayerEntities.mockReturnValue([p]);

    tick();
    expect(mockSharedState.setAttachedPlayer).toHaveBeenCalledWith(p);
  });

  it('pass targets have priority over closer normal players', () => {
    setup();
    ball().position = { x: 7, y: 6, z: -3 };
    ball().linearVelocity = { x: 2, y: 0, z: 0 };

    const closer = makeSoccerPlayer({
      position: { x: 9, y: 6, z: -3 }, // 2 units
      isSpawned: true,
      isStunned: false,
      getIncomingPassTarget: vi.fn().mockReturnValue(null),
    });
    const passTarget = makeSoccerPlayer({
      position: { x: 12, y: 6, z: -3 }, // 5 units but pass target
      isSpawned: true,
      isStunned: false,
      getIncomingPassTarget: vi.fn().mockReturnValue({ x: 12, y: 6, z: -3 }),
    });
    mockWorld.entityManager.getAllPlayerEntities.mockReturnValue([closer, passTarget]);

    tick();
    expect(mockSharedState.setAttachedPlayer).toHaveBeenCalledWith(passTarget);
  });

  it('attached ball follows player position with offset', () => {
    setup();
    const p = makeSoccerPlayer({
      position: { x: 10, y: 6, z: -3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
    });
    mockSharedState._setAttachedPlayer(p);

    tick();
    expect(ball().setPosition).toHaveBeenCalled();
    const pos = ball().setPosition.mock.calls[0][0];
    // Identity rotation → direction = (0, 0, 1)
    // offset: x - 0*0.7 = 10, y - 0.5 = 5.5, z - 1*0.7 = -3.7
    expect(pos.x).toBeCloseTo(10, 1);
    expect(pos.y).toBeCloseTo(5.5, 1);
    expect(pos.z).toBeCloseTo(-3.7, 1);
  });

  it('attached ball rotates based on player speed', () => {
    setup();
    const p = makeSoccerPlayer({
      position: { x: 10, y: 6, z: -3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 5, y: 0, z: 0 },
    });
    mockSharedState._setAttachedPlayer(p);
    ball().setAngularVelocity.mockClear();

    tick();
    expect(ball().setAngularVelocity).toHaveBeenCalled();
    const av = ball().setAngularVelocity.mock.calls[0][0];
    expect(av.y).toBe(0); // no vertical rotation
  });

  it('ball velocity set to zero when attached', () => {
    setup();
    mockSharedState._setAttachedPlayer(makeSoccerPlayer({
      position: { x: 10, y: 6, z: -3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
    }));
    ball().setLinearVelocity.mockClear();

    tick();
    expect(ball().setLinearVelocity).toHaveBeenCalledWith({ x: 0, y: 0, z: 0 });
  });

  it('updates ball stationary tracking each tick', () => {
    setup();
    ball().position = { x: 7, y: 6, z: -3 };
    tick();
    expect(mockSharedState.updateBallStationaryStatus).toHaveBeenCalled();
  });

  it('does not query player entities when ball is attached', () => {
    setup();
    mockSharedState._setAttachedPlayer(makeSoccerPlayer({
      position: { x: 10, y: 6, z: -3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
    }));
    mockWorld.entityManager.getAllPlayerEntities.mockClear();

    tick();
    expect(mockWorld.entityManager.getAllPlayerEntities).not.toHaveBeenCalled();
  });

  it('stunned player excluded from proximity possession', () => {
    setup();
    ball().position = { x: 7, y: 6, z: -3 };
    ball().linearVelocity = { x: 0, y: 0, z: 0 };

    const stunned = makeSoccerPlayer({ position: { x: 8, y: 6, z: -3 }, isSpawned: true, isStunned: true });
    mockWorld.entityManager.getAllPlayerEntities.mockReturnValue([stunned]);

    tick();
    expect(mockSharedState.setAttachedPlayer).not.toHaveBeenCalledWith(stunned);
  });

  it('ball trail updated each tick (fast ball creates emitter)', () => {
    setup();
    ball().position = { x: 7, y: 6, z: -3 };
    ball().linearVelocity = { x: 12, y: 0, z: 0 };
    ball().isSpawned = true;

    tick();
    expect(captured.particleEmitters.length).toBeGreaterThanOrEqual(1);
  });

  it('stationary player stops ball rotation', () => {
    setup();

    // First, get the ball moving fast to establish a non-zero angular velocity cache
    const movingPlayer = makeSoccerPlayer({
      position: { x: 10, y: 6, z: -3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 5, y: 0, z: 0 }, // moving fast
    });
    mockSharedState._setAttachedPlayer(movingPlayer);
    tick();

    // Advance time past the ANGULAR_VELOCITY_UPDATE_INTERVAL (50ms)
    vi.advanceTimersByTime(100);

    // Now set stationary player (speed < 0.5)
    const stationaryPlayer = makeSoccerPlayer({
      position: { x: 10, y: 6, z: -3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0.1, y: 0, z: 0 },
    });
    mockSharedState._setAttachedPlayer(stationaryPlayer);
    ball().setAngularVelocity.mockClear();

    tick();
    // The change from non-zero to zero is significant enough to trigger the update
    expect(ball().setAngularVelocity).toHaveBeenCalledWith(
      expect.objectContaining({ x: 0, y: 0, z: 0 })
    );
  });

  it('clearIncomingPass called when pass target receives ball', () => {
    setup();
    ball().position = { x: 7, y: 6, z: -3 };
    ball().linearVelocity = { x: 2, y: 0, z: 0 };

    const passTarget = makeSoccerPlayer({
      position: { x: 12, y: 6, z: -3 },
      isSpawned: true,
      isStunned: false,
      getIncomingPassTarget: vi.fn().mockReturnValue({ x: 12, y: 6, z: -3 }),
    });
    mockWorld.entityManager.getAllPlayerEntities.mockReturnValue([passTarget]);

    tick();
    expect(passTarget.clearIncomingPass).toHaveBeenCalled();
  });

  it('unspawned player excluded from proximity possession', () => {
    setup();
    ball().position = { x: 7, y: 6, z: -3 };
    ball().linearVelocity = { x: 0, y: 0, z: 0 };

    const unspawned = makeSoccerPlayer({ position: { x: 8, y: 6, z: -3 }, isSpawned: false, isStunned: false });
    mockWorld.entityManager.getAllPlayerEntities.mockReturnValue([unspawned]);

    tick();
    expect(mockSharedState.setAttachedPlayer).not.toHaveBeenCalledWith(unspawned);
  });
});

// ═════════════════════════════════════════════════════════════════
// Constants validation
// ═════════════════════════════════════════════════════════════════
describe('constants validation', () => {
  it('BALL_TRAIL_SPEED_THRESHOLD = 8 (speed exactly 8 does NOT activate)', () => {
    cleanupBallTrail();
    captured.particleEmitters.length = 0;
    const b = createMockEntity({ isSpawned: true, linearVelocity: { x: 8, y: 0, z: 0 } });
    updateBallTrail(b as any, createMockWorld() as any);
    expect(captured.particleEmitters.length).toBe(0);

    b.linearVelocity = { x: 8.01, y: 0, z: 0 };
    updateBallTrail(b as any, createMockWorld() as any);
    expect(captured.particleEmitters.length).toBe(1);
  });

  it('hysteresis deactivation at 0.6 * 8 = 4.8', () => {
    cleanupBallTrail();
    captured.particleEmitters.length = 0;
    const b = createMockEntity({ isSpawned: true, linearVelocity: { x: 10, y: 0, z: 0 } });
    const w = createMockWorld();
    updateBallTrail(b as any, w as any);
    const em = captured.particleEmitters[0];

    b.linearVelocity = { x: 4.9, y: 0, z: 0 }; // > 4.8
    updateBallTrail(b as any, w as any);
    expect(em.despawn).not.toHaveBeenCalled();

    b.linearVelocity = { x: 4.7, y: 0, z: 0 }; // < 4.8
    updateBallTrail(b as any, w as any);
    expect(em.despawn).toHaveBeenCalled();
  });

  it('proximity distance 3.5 for slow ball', () => {
    createSoccerBall(mockWorld as any);
    vi.advanceTimersByTime(1500);
    mockSharedState.setAttachedPlayer.mockClear();

    ball().position = { x: 7, y: 6, z: -3 };
    ball().linearVelocity = { x: 0, y: 0, z: 0 };

    const p = makeSoccerPlayer({
      position: { x: 10.4, y: 6, z: -3 }, // 3.4 units (within 3.5)
      isSpawned: true,
      isStunned: false,
      getIncomingPassTarget: vi.fn().mockReturnValue(null),
    });
    mockWorld.entityManager.getAllPlayerEntities.mockReturnValue([p]);
    fireEntityEvent('tick', { entity: ball(), tickDeltaMs: 16 });

    expect(mockSharedState.setAttachedPlayer).toHaveBeenCalledWith(p);
  });

  it('magnetic pass reception radius = 6.0 units', () => {
    createSoccerBall(mockWorld as any);
    vi.advanceTimersByTime(1500);
    mockSharedState.setAttachedPlayer.mockClear();

    ball().position = { x: 7, y: 6, z: -3 };
    ball().linearVelocity = { x: 2, y: 0, z: 0 };

    const pt = makeSoccerPlayer({
      position: { x: 12.9, y: 6, z: -3 }, // 5.9 units
      isSpawned: true,
      isStunned: false,
      getIncomingPassTarget: vi.fn().mockReturnValue({ x: 12, y: 6, z: -3 }),
    });
    mockWorld.entityManager.getAllPlayerEntities.mockReturnValue([pt]);
    fireEntityEvent('tick', { entity: ball(), tickDeltaMs: 16 });

    expect(mockSharedState.setAttachedPlayer).toHaveBeenCalledWith(pt);
  });
});

// ═════════════════════════════════════════════════════════════════
// Edge cases
// ═════════════════════════════════════════════════════════════════
describe('edge cases', () => {
  it('ball reset during initialization is skipped', () => {
    createSoccerBall(mockWorld as any);
    // Do NOT advance timers — still initializing
    ball().position = { x: 7, y: -5, z: -3 };
    ball().despawn.mockClear();
    fireEntityEvent('tick', { entity: ball(), tickDeltaMs: 16 });
    expect(ball().despawn).not.toHaveBeenCalled();
  });

  it('ball already spawned does not double-spawn', () => {
    ballRef.current.isSpawned = true;
    const result = createSoccerBall(mockWorld as any);
    expect(result).toBeDefined();
  });
});
