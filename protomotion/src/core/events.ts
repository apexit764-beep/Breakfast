/**
 * Internal event bus for decoupled communication between modules.
 *
 * Why an event bus instead of direct imports?
 *
 * The pipeline (Parser → PlaybackEngine → TimelineBuilder → Renderer →
 * Exporter) is sequential, but cross-cutting concerns like progress
 * reporting, error handling, and cancellation need to reach the UI
 * without every module importing the message layer. The event bus
 * provides this decoupling.
 *
 * This is NOT a pub/sub message broker. It's a typed, synchronous
 * event emitter scoped to a single export run. One bus per run.
 */

export type EventMap = {
  'parse:start': { flowId: string };
  'parse:complete': { nodeCount: number; interactionCount: number };
  'parse:error': { message: string; nodeId?: string };

  'timeline:start': { flowId: string };
  'timeline:complete': { segmentCount: number; totalDuration: number };
  'timeline:error': { message: string };

  'render:start': { totalFrames: number };
  'render:frame': { frameIndex: number; totalFrames: number };
  'render:complete': Record<string, never>;
  'render:error': { message: string; frameIndex?: number };

  'export:start': { jobId: string };
  'export:progress': { percent: number; currentFrame: number; totalFrames: number };
  'export:complete': { jobId: string; outputPath: string; outputSize: number };
  'export:error': { jobId: string; message: string; code: string };
  'export:cancelled': { jobId: string };

  'warning': { message: string; context?: string };
};

export type EventName = keyof EventMap;
export type EventPayload<E extends EventName> = EventMap[E];
export type EventHandler<E extends EventName> = (payload: EventPayload<E>) => void;

export class EventBus {
  private readonly listeners = new Map<EventName, Set<EventHandler<EventName>>>();

  on<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as EventHandler<EventName>);

    return () => {
      set!.delete(handler as EventHandler<EventName>);
    };
  }

  emit<E extends EventName>(event: E, payload: EventPayload<E>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(payload);
    }
  }

  removeAllListeners(event?: EventName): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
