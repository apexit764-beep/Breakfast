/**
 * ProtoMotion Engine — top-level orchestrator.
 *
 * Coordinates the full export pipeline:
 *
 *   1. Parse:    Read Figma document → PrototypeGraph
 *   2. Playback: Simulate interactions → PlaybackEvent[]
 *   3. Timeline: Build render timeline → RenderTimeline
 *   4. Render:   Generate frames       → RenderedFrame[]
 *   5. Export:   Encode video           → output file
 *
 * Each step is handled by its own module. The engine wires them together,
 * manages cancellation, and reports progress via the EventBus.
 *
 * Usage:
 *   const engine = new ProtoMotionEngine(config);
 *   engine.on('export:progress', (p) => updateUI(p));
 *   await engine.export(flowId, settings);
 */

import type { ProtoMotionConfig } from './config';
import type { ExportSettings } from '@/types/export';
import type { PrototypeGraph } from '@/types/prototype';
import type { RenderTimeline } from '@/types/timeline';
import { EventBus } from './events';
import type { EventName, EventHandler } from './events';
import type { IPrototypeParser } from '@/parser';
import type { IPlaybackEngine } from '@/playback';
import type { ITimelineBuilder } from '@/timeline';
import type { IFrameRenderer } from '@/renderer';
import type { IExporter } from '@/export';

export class ProtoMotionEngine {
  private readonly bus: EventBus;
  private readonly config: ProtoMotionConfig;
  private abortController: AbortController | null = null;

  private parser: IPrototypeParser | null = null;
  private playbackEngine: IPlaybackEngine | null = null;
  private timelineBuilder: ITimelineBuilder | null = null;
  private frameRenderer: IFrameRenderer | null = null;
  private exporter: IExporter | null = null;

  constructor(config: ProtoMotionConfig) {
    this.config = config;
    this.bus = new EventBus();
  }

  registerParser(parser: IPrototypeParser): void {
    this.parser = parser;
  }

  registerPlaybackEngine(engine: IPlaybackEngine): void {
    this.playbackEngine = engine;
  }

  registerTimelineBuilder(builder: ITimelineBuilder): void {
    this.timelineBuilder = builder;
  }

  registerFrameRenderer(renderer: IFrameRenderer): void {
    this.frameRenderer = renderer;
  }

  registerExporter(exporter: IExporter): void {
    this.exporter = exporter;
  }

  on<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    return this.bus.on(event, handler);
  }

  async parse(flowId: string): Promise<PrototypeGraph> {
    this.assertModule(this.parser, 'Parser');

    this.bus.emit('parse:start', { flowId });
    try {
      const graph = await this.parser!.parse(flowId);
      this.bus.emit('parse:complete', {
        nodeCount: graph.nodes.size,
        interactionCount: this.countInteractions(graph),
      });
      return graph;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.bus.emit('parse:error', { message });
      throw err;
    }
  }

  async buildTimeline(
    graph: PrototypeGraph,
    flowId: string,
    settings: ExportSettings,
  ): Promise<RenderTimeline> {
    this.assertModule(this.playbackEngine, 'PlaybackEngine');
    this.assertModule(this.timelineBuilder, 'TimelineBuilder');

    this.bus.emit('timeline:start', { flowId });
    try {
      const events = await this.playbackEngine!.simulate(graph, flowId, this.config.playback);
      const timeline = this.timelineBuilder!.build(graph, events, {
        fps: settings.fps,
        resolution: settings.resolution,
      });
      this.bus.emit('timeline:complete', {
        segmentCount: timeline.segments.length,
        totalDuration: timeline.totalDuration,
      });
      return timeline;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.bus.emit('timeline:error', { message });
      throw err;
    }
  }

  async export(flowId: string, settings: ExportSettings): Promise<string> {
    this.assertModule(this.parser, 'Parser');
    this.assertModule(this.playbackEngine, 'PlaybackEngine');
    this.assertModule(this.timelineBuilder, 'TimelineBuilder');
    this.assertModule(this.frameRenderer, 'FrameRenderer');
    this.assertModule(this.exporter, 'Exporter');

    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const jobId = this.generateJobId();

    this.bus.emit('export:start', { jobId });

    try {
      const graph = await this.parse(flowId);
      this.checkAborted(signal);

      const timeline = await this.buildTimeline(graph, flowId, settings);
      this.checkAborted(signal);

      const totalFrames = Math.ceil(
        (timeline.totalDuration / 1000) * settings.fps,
      );

      this.bus.emit('render:start', { totalFrames });

      const outputPath = await this.exporter!.encode(
        timeline,
        graph,
        settings,
        this.frameRenderer!,
        {
          signal,
          onFrame: (frameIndex) => {
            this.bus.emit('render:frame', { frameIndex, totalFrames });
            this.bus.emit('export:progress', {
              percent: Math.round((frameIndex / totalFrames) * 100),
              currentFrame: frameIndex,
              totalFrames,
            });
          },
        },
      );

      this.bus.emit('render:complete', {});
      this.bus.emit('export:complete', { jobId, outputPath, outputSize: 0 });

      return outputPath;
    } catch (err) {
      if (signal.aborted) {
        this.bus.emit('export:cancelled', { jobId });
        throw new ExportCancelledError(jobId);
      }
      const message = err instanceof Error ? err.message : String(err);
      this.bus.emit('export:error', { jobId, message, code: 'UNKNOWN' });
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  private assertModule(module: unknown, name: string): void {
    if (!module) {
      throw new Error(`${name} not registered. Call register${name}() before running the pipeline.`);
    }
  }

  private checkAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Error('Export cancelled');
    }
  }

  private countInteractions(graph: PrototypeGraph): number {
    let count = 0;
    for (const node of graph.nodes.values()) {
      count += node.interactions.length;
    }
    return count;
  }

  private generateJobId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'job_';
    for (let i = 0; i < 12; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }
}

export class ExportCancelledError extends Error {
  readonly jobId: string;
  constructor(jobId: string) {
    super(`Export ${jobId} was cancelled`);
    this.name = 'ExportCancelledError';
    this.jobId = jobId;
  }
}
