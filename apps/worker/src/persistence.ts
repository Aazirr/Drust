import type { Operation, RustplusEntityPairing, RustplusServerPairing } from '@drust/domain'
import { Pool } from 'pg'

type PersistedAlarmBindingRow = {
  target: 'small-oil' | 'large-oil'
  entity_id: string
  entity_type: string | null
  entity_name: string | null
  received_at: Date
  source: 'local-helper'
}

type PersistedServerPairingRow = {
  source: 'local-helper'
  received_at: Date
  server_name: string
  server_description: string | null
  server_url: string | null
  server_ip: string
  app_port: number
  player_id: string
  player_token: string
}

export class WorkerPersistence {
  private readonly pool: Pool | null

  constructor(databaseUrl: string | null) {
    this.pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null
  }

  get enabled(): boolean {
    return this.pool !== null
  }

  async init(): Promise<void> {
    if (!this.pool) {
      return
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rustplus_server_pairing (
        singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
        source TEXT NOT NULL,
        received_at TIMESTAMPTZ NOT NULL,
        server_name TEXT NOT NULL,
        server_description TEXT,
        server_url TEXT,
        server_ip TEXT NOT NULL,
        app_port INTEGER NOT NULL,
        player_id TEXT NOT NULL,
        player_token TEXT NOT NULL
      )
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rustplus_alarm_binding (
        target TEXT PRIMARY KEY CHECK (target IN ('small-oil', 'large-oil')),
        source TEXT NOT NULL,
        received_at TIMESTAMPTZ NOT NULL,
        entity_id TEXT NOT NULL,
        entity_type TEXT,
        entity_name TEXT
      )
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS operation (
        operation_id TEXT PRIMARY KEY,
        target TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        trigger_entity_id TEXT,
        trigger_marker_id TEXT,
        result TEXT,
        close_note TEXT,
        completed_checkpoints TEXT[] NOT NULL DEFAULT '{}'
      )
    `)

    /* Migration: add completed_checkpoints column to existing table. */
    await this.pool.query(`
      DO $$ BEGIN
        ALTER TABLE operation ADD COLUMN IF NOT EXISTS completed_checkpoints TEXT[] NOT NULL DEFAULT '{}';
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$
    `)
  }

  async loadRustplusState(): Promise<{
    serverPairing: RustplusServerPairing | null
    alarmBindings: RustplusEntityPairing[]
  }> {
    if (!this.pool) {
      return {
        serverPairing: null,
        alarmBindings: [],
      }
    }

    const [serverResult, alarmResult] = await Promise.all([
      this.pool.query<PersistedServerPairingRow>(
        `
          SELECT
            source,
            received_at,
            server_name,
            server_description,
            server_url,
            server_ip,
            app_port,
            player_id,
            player_token
          FROM rustplus_server_pairing
          WHERE singleton = TRUE
          LIMIT 1
        `,
      ),
      this.pool.query<PersistedAlarmBindingRow>(
        `
          SELECT
            target,
            source,
            received_at,
            entity_id,
            entity_type,
            entity_name
          FROM rustplus_alarm_binding
          ORDER BY target ASC
        `,
      ),
    ])

    const serverPairing = serverResult.rows[0]
      ? this.mapServerPairing(serverResult.rows[0])
      : null

    return {
      serverPairing,
      alarmBindings: alarmResult.rows.map((row: PersistedAlarmBindingRow) => this.mapAlarmBinding(row)),
    }
  }

  async saveServerPairing(pairing: RustplusServerPairing): Promise<void> {
    if (!this.pool) {
      return
    }

    await this.pool.query(
      `
        INSERT INTO rustplus_server_pairing (
          singleton,
          source,
          received_at,
          server_name,
          server_description,
          server_url,
          server_ip,
          app_port,
          player_id,
          player_token
        )
        VALUES (
          TRUE,
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9
        )
        ON CONFLICT (singleton) DO UPDATE SET
          source = EXCLUDED.source,
          received_at = EXCLUDED.received_at,
          server_name = EXCLUDED.server_name,
          server_description = EXCLUDED.server_description,
          server_url = EXCLUDED.server_url,
          server_ip = EXCLUDED.server_ip,
          app_port = EXCLUDED.app_port,
          player_id = EXCLUDED.player_id,
          player_token = EXCLUDED.player_token
      `,
      [
        pairing.source,
        pairing.receivedAt,
        pairing.serverName,
        pairing.serverDescription,
        pairing.serverUrl,
        pairing.serverIp,
        pairing.appPort,
        pairing.playerId,
        pairing.playerToken,
      ],
    )
  }

  async saveAlarmBinding(pairing: RustplusEntityPairing): Promise<void> {
    if (!this.pool) {
      return
    }

    await this.pool.query(
      `
        INSERT INTO rustplus_alarm_binding (
          target,
          source,
          received_at,
          entity_id,
          entity_type,
          entity_name
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (target) DO UPDATE SET
          source = EXCLUDED.source,
          received_at = EXCLUDED.received_at,
          entity_id = EXCLUDED.entity_id,
          entity_type = EXCLUDED.entity_type,
          entity_name = EXCLUDED.entity_name
      `,
      [
        pairing.target,
        pairing.source,
        pairing.receivedAt,
        pairing.entityId,
        pairing.entityType,
        pairing.entityName,
      ],
    )
  }

  async deleteAlarmBinding(target: 'small-oil' | 'large-oil'): Promise<void> {
    if (!this.pool) {
      return
    }

    await this.pool.query(
      `
        DELETE FROM rustplus_alarm_binding
        WHERE target = $1
      `,
      [target],
    )
  }

  async saveOperation(operation: Operation, completedCheckpoints: string[] = []): Promise<void> {
    if (!this.pool) {
      return
    }

    await this.pool.query(
      `
        INSERT INTO operation (
          operation_id,
          target,
          source,
          status,
          started_at,
          ends_at,
          trigger_entity_id,
          trigger_marker_id,
          result,
          close_note,
          completed_checkpoints
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (operation_id) DO UPDATE SET
          status = EXCLUDED.status,
          ends_at = EXCLUDED.ends_at,
          result = EXCLUDED.result,
          close_note = EXCLUDED.close_note,
          completed_checkpoints = EXCLUDED.completed_checkpoints
      `,
      [
        operation.operationId,
        operation.target,
        operation.source,
        operation.status,
        operation.startedAt,
        operation.endsAt,
        operation.triggerEntityId,
        operation.triggerMarkerId,
        operation.result,
        operation.closeNote,
        completedCheckpoints,
      ],
    )
  }

  async loadLatestOperation(): Promise<{
    operation: Operation | null
    completedCheckpoints: string[]
  }> {
    if (!this.pool) {
      return { operation: null, completedCheckpoints: [] }
    }

    const result = await this.pool.query<{
      operation_id: string
      target: string
      source: string
      status: string
      started_at: Date
      ends_at: Date
      trigger_entity_id: string | null
      trigger_marker_id: string | null
      result: string | null
      close_note: string | null
      completed_checkpoints: string[]
    }>(
      `
        SELECT * FROM operation
        WHERE status = 'active'
        ORDER BY started_at DESC
        LIMIT 1
      `,
    )

    const row = result.rows[0]
    if (!row) {
      return { operation: null, completedCheckpoints: [] }
    }

    const endsAtMs = new Date(row.ends_at).getTime()
    const remainingSeconds = Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000))
    const isExpired = remainingSeconds <= 0

    return {
      operation: {
        operationId: row.operation_id,
        target: row.target as Operation['target'],
        source: row.source as Operation['source'],
        status: isExpired ? 'closed' : (row.status as Operation['status']),
        startedAt: row.started_at.toISOString(),
        endsAt: row.ends_at.toISOString(),
        remainingSeconds,
        triggerEntityId: row.trigger_entity_id,
        triggerMarkerId: row.trigger_marker_id,
        result: isExpired ? null : (row.result as Operation['result'] | null),
        closeNote: row.close_note,
      },
      completedCheckpoints: row.completed_checkpoints ?? [],
    }
  }

  private mapServerPairing(row: PersistedServerPairingRow): RustplusServerPairing {
    return {
      source: row.source,
      receivedAt: row.received_at.toISOString(),
      serverName: row.server_name,
      serverDescription: row.server_description,
      serverUrl: row.server_url,
      serverIp: row.server_ip,
      appPort: row.app_port,
      playerId: row.player_id,
      playerToken: row.player_token,
    }
  }

  private mapAlarmBinding(row: PersistedAlarmBindingRow): RustplusEntityPairing {
    return {
      source: row.source,
      receivedAt: row.received_at.toISOString(),
      target: row.target,
      entityId: row.entity_id,
      entityType: row.entity_type,
      entityName: row.entity_name,
    }
  }
}
