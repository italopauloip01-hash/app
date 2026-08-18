import Dexie, { type Table } from 'dexie';
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
    }
}

export const db = new AirTechDatabase();
