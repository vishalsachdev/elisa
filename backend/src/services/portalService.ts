/** Manages portal adapters per session -- connects agents to external things. */

import type { HardwareService } from './hardwareService.js';

export interface PortalCapability {
  id: string;
  name: string;
  kind: 'action' | 'event' | 'query';
  description: string;
}

export interface PortalSpec {
  id: string;
  name: string;
  description: string;
  mechanism: string;
  capabilities: PortalCapability[];
  interactions: Array<{ type: 'tell' | 'when' | 'ask'; capabilityId: string }>;
  mcpConfig?: Record<string, unknown>;
  cliConfig?: Record<string, unknown>;
  serialConfig?: Record<string, unknown>;
}

export interface PortalRuntime {
  id: string;
  name: string;
  mechanism: string;
  adapter: PortalAdapter;
  status: 'initializing' | 'ready' | 'error';
}

export interface PortalAdapter {
  initialize(config: Record<string, unknown>): Promise<void>;
  getCapabilities(): PortalCapability[];
  teardown(): Promise<void>;
}

/** Wraps existing HardwareService for serial-connected boards. */
export class SerialPortalAdapter implements PortalAdapter {
  private capabilities: PortalCapability[] = [];
  private hardwareService: HardwareService;

  constructor(hardwareService: HardwareService, capabilities: PortalCapability[]) {
    this.hardwareService = hardwareService;
    this.capabilities = capabilities;
  }

  async initialize(_config: Record<string, unknown>): Promise<void> {
    // Board detection delegated to orchestrator deploy phase
  }

  getCapabilities(): PortalCapability[] {
    return this.capabilities;
  }

  async teardown(): Promise<void> {
    // Serial port cleanup handled by orchestrator
  }
}

/** Generates MCP server config for injection into Claude CLI. */
export class McpPortalAdapter implements PortalAdapter {
  private capabilities: PortalCapability[] = [];
  private mcpConfig: { command: string; args?: string[]; env?: Record<string, string> } = { command: '' };

  constructor(capabilities: PortalCapability[]) {
    this.capabilities = capabilities;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.mcpConfig = {
      command: (config.command as string) ?? '',
      args: (config.args as string[]) ?? undefined,
      env: (config.env as Record<string, string>) ?? undefined,
    };
  }

  getCapabilities(): PortalCapability[] {
    return this.capabilities;
  }

  getMcpServerConfig(): { command: string; args?: string[]; env?: Record<string, string> } {
    return this.mcpConfig;
  }

  async teardown(): Promise<void> {
    // MCP servers are ephemeral per CLI invocation
  }
}

/** Wraps a CLI tool invocation. */
export class CliPortalAdapter implements PortalAdapter {
  private capabilities: PortalCapability[] = [];
  private command = '';

  constructor(capabilities: PortalCapability[]) {
    this.capabilities = capabilities;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.command = (config.command as string) ?? '';
  }

  getCapabilities(): PortalCapability[] {
    return this.capabilities;
  }

  getCommand(): string {
    return this.command;
  }

  async teardown(): Promise<void> {}
}

/** Manages adapter lifecycle per session. */
export class PortalService {
  private runtimes = new Map<string, PortalRuntime>();
  private hardwareService: HardwareService;

  constructor(hardwareService: HardwareService) {
    this.hardwareService = hardwareService;
  }

  async initializePortals(portalSpecs: PortalSpec[]): Promise<void> {
    for (const spec of portalSpecs) {
      let adapter: PortalAdapter;
      const mechanism = spec.mechanism === 'auto' ? this.detectMechanism(spec) : spec.mechanism;

      switch (mechanism) {
        case 'serial':
          adapter = new SerialPortalAdapter(this.hardwareService, spec.capabilities);
          await adapter.initialize(spec.serialConfig ?? {});
          break;
        case 'mcp':
          adapter = new McpPortalAdapter(spec.capabilities);
          await adapter.initialize(spec.mcpConfig ?? {});
          break;
        case 'cli':
          adapter = new CliPortalAdapter(spec.capabilities);
          await adapter.initialize(spec.cliConfig ?? {});
          break;
        default:
          adapter = new CliPortalAdapter(spec.capabilities);
          await adapter.initialize({});
      }

      this.runtimes.set(spec.id, {
        id: spec.id,
        name: spec.name,
        mechanism,
        adapter,
        status: 'ready',
      });
    }
  }

  getRuntime(portalId: string): PortalRuntime | undefined {
    return this.runtimes.get(portalId);
  }

  getAllRuntimes(): PortalRuntime[] {
    return Array.from(this.runtimes.values());
  }

  /** Collect MCP server configs from all MCP portals. */
  getMcpServers(): Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }> {
    const servers: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }> = [];
    for (const runtime of this.runtimes.values()) {
      if (runtime.adapter instanceof McpPortalAdapter) {
        const config = runtime.adapter.getMcpServerConfig();
        if (config.command) {
          servers.push({ name: runtime.name, ...config });
        }
      }
    }
    return servers;
  }

  /** Check if any portals use serial mechanism. */
  hasSerialPortals(): boolean {
    for (const runtime of this.runtimes.values()) {
      if (runtime.mechanism === 'serial') return true;
    }
    return false;
  }

  async teardownAll(): Promise<void> {
    for (const runtime of this.runtimes.values()) {
      try {
        await runtime.adapter.teardown();
      } catch {
        // ignore cleanup errors
      }
    }
    this.runtimes.clear();
  }

  private detectMechanism(spec: PortalSpec): string {
    if (spec.serialConfig) return 'serial';
    if (spec.mcpConfig) return 'mcp';
    if (spec.cliConfig) return 'cli';
    return 'cli';
  }
}
