// Agent Orchestrator Service (APP-09 / DU-06).
// Consumes detect.alerts.v1 and drives the incident investigation workflow.

import { Kafka } from "kafkajs";
import type { Consumer } from "kafkajs";
import type { Pool } from "pg";
import type { Config } from "@fp/config";
import {
  CausalEngine,
  LineImpactService,
  TrustService,
} from "@fp/intel-core";
import type { AlertEnvelope } from "@fp/intel-core";
import { KnowledgeService } from "@fp/knowledge-svc";
import { IncidentInvestigationWorkflow } from "./workflow.js";
import type { IncidentWorkflowState } from "./types.js";

export class AgentOrchestratorService {
  private readonly kafka: Kafka;
  private consumer: Consumer | null = null;
  private readonly workflow: IncidentInvestigationWorkflow;
  private isRunning = false;

  constructor(
    private readonly cfg: Config,
    private readonly pool: Pool
  ) {
    this.kafka = new Kafka({
      clientId: "fp-agent-orchestrator",
      brokers: cfg.kafka.brokers,
    });

    const trustService = new TrustService(pool);
    const impactService = new LineImpactService(pool);
    const causalEngine = new CausalEngine();
    const knowledgeService = new KnowledgeService(cfg, pool);

    this.workflow = new IncidentInvestigationWorkflow({
      pool,
      trustService,
      impactService,
      causalEngine,
      knowledgeService,
    });
  }

  public getWorkflow(): IncidentInvestigationWorkflow {
    return this.workflow;
  }

  public async start(options?: { groupId?: string; fromBeginning?: boolean }): Promise<void> {
    const groupId = options?.groupId ?? "fp-agent-orchestrator";
    this.consumer = this.kafka.consumer({ groupId });

    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: this.cfg.kafka.alerts_topic,
      fromBeginning: options?.fromBeginning ?? false,
    });

    this.isRunning = true;
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        try {
          const alert = JSON.parse(message.value.toString("utf8")) as AlertEnvelope;
          await this.workflow.execute(alert);
        } catch (err) {
          console.error("[AgentOrchestrator] Error processing alert:", err);
        }
      },
    });
  }

  public async processAlert(alert: AlertEnvelope): Promise<IncidentWorkflowState> {
    return this.workflow.execute(alert);
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }
  }
}
