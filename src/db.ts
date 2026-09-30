import Dexie, { type Table } from 'dexie';
import { normalizeRecord } from './utils/normalize';
import type { Client, Service, ServiceTemplate, CompanySettings, Helper, HelperEntry, Estimate } from './types';

export type LocalTableName = 'clients' | 'services' | 'helpers' | 'helperEntries' | 'serviceTemplates' | 'settings' | 'estimates';

// Mapeamento tabela local (Dexie) -> tabela remota (Supabase)
export const SYNCED_TABLES: { local: LocalTableName; remote: string }[] = [
    { local: 'clients', remote: 'clients' },
    { local: 'services', remote: 'services' },
    { local: 'helpers', remote: 'helpers' },
    { local: 'helperEntries', remote: 'helper_entries' },
    { local: 'serviceTemplates', remote: 'service_templates' },
    { local: 'settings', remote: 'settings' },
    { local: 'estimates', remote: 'estimates' },
];

export interface OutboxEntry {
    key: string; // `${table}:${recordId}`
    table: LocalTableName;
    recordId: string;
    op: 'upsert' | 'delete';
    ts: number;
}

export class AirTechDatabase extends Dexie {
    outbox!: Table<OutboxEntry, string>;
    clients!: Table<Client>;
    services!: Table<Service>;
    serviceTemplates!: Table<ServiceTemplate>;
    settings!: Table<CompanySettings>;
    helpers!: Table<Helper>;
    helperEntries!: Table<HelperEntry>;
    estimates!: Table<Estimate>;

    constructor() {
        super('AirTechDB');
        this.version(7).stores({
            clients: 'id, name, phone',
            services: 'id, clientId, date, nextServiceDate',
            serviceTemplates: 'id, name',
            settings: 'id',
            helpers: 'id, name, active',
            helperEntries: 'id, helperId, date, type',
            estimates: 'id, clientId, clientName, date'
        });

        // v8: mesmo schema, mas padroniza registros antigos que vieram do Supabase
        // com datas/valores em string (causa das somas mensais zeradas).
        this.version(8).stores({}).upgrade(async tx => {
            for (const table of ['services', 'helperEntries', 'estimates', 'serviceTemplates', 'clients']) {
                await tx.table(table).toCollection().modify((record: Record<string, unknown>) => {
                    Object.assign(record, normalizeRecord(record));
                });
            }
        });

        // v9: fila de pendências (outbox). O sync passa a enviar só o que mudou e
        // a registrar exclusões, em vez de reenviar tudo a cada vez.
        this.version(9).stores({
            outbox: 'key, table'
        }).upgrade(async tx => {
            // Na primeira vez, enfileira tudo o que existe (equivale ao comportamento antigo),
            // para não perder alterações feitas offline antes da atualização.
            const now = Date.now();
            for (const table of SYNCED_TABLES) {
                const ids = await tx.table(table.local).toCollection().primaryKeys();
                await tx.table('outbox').bulkPut(ids.map(id => ({
                    key: `${table.local}:${id}`,
                    table: table.local,
                    recordId: String(id),
                    op: 'upsert',
                    ts: now,
                })));
            }
        });
    }
}

export const db = new AirTechDatabase();
