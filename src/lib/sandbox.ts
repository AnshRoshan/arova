export type SandboxState = "CREATING" | "READY" | "STARTING" | "ACTIVE" | "IDLE" | "PAUSING" | "PAUSED" | "STOPPING" | "STOPPED" | "ERROR" | "DESTROYING" | "DESTROYED";
export type Command = { type: "browser" | "computer"; action: string; input?: Record<string, unknown> };
export interface SandboxProvider {
  readonly name: string;
  create(input: { workspaceId: string; agentId: string }): Promise<{ id: string; status: SandboxState }>;
  get(id: string): Promise<{ id: string; status: SandboxState }>;
  start(id: string): Promise<void>;
  pause(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  destroy(id: string): Promise<void>;
  execute(id: string, command: Command): Promise<{ output: string }>;
  browser(id: string): Promise<{ url: string }>;
  stream(id: string): Promise<{ url: string }>;
}

// A safe, explicit no-op provider for development without container infrastructure.
// It never claims to have opened a browser or run a command.
export class UnconfiguredSandboxProvider implements SandboxProvider {
  readonly name = "unconfigured";
  private unavailable(): never { throw new Error("Computer runtime is not configured. Set up a sandbox provider to use browser and desktop tasks."); }
  async create(): Promise<{ id: string; status: SandboxState }> { return this.unavailable(); }
  async get(): Promise<{ id: string; status: SandboxState }> { return this.unavailable(); }
  async start(): Promise<void> { return this.unavailable(); }
  async pause(): Promise<void> { return this.unavailable(); }
  async stop(): Promise<void> { return this.unavailable(); }
  async destroy(): Promise<void> { return this.unavailable(); }
  async execute(): Promise<{ output: string }> { return this.unavailable(); }
  async browser(): Promise<{ url: string }> { return this.unavailable(); }
  async stream(): Promise<{ url: string }> { return this.unavailable(); }
}

export const sandboxProvider: SandboxProvider = new UnconfiguredSandboxProvider();
