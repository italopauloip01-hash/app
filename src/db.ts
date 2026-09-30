import Dexie, { type Table } from 'dexie';
import { normalizeRecord } from './utils/normalize';
import type { Client, Service, ServiceTemplate, CompanySettings, Helper, HelperEntry, Estimate } from './types';

export class AirTechDatabase extends Dexie {
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
    }
}

export const db = new AirTechDatabase();
