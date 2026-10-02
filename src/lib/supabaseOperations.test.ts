import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeSupabase } from '../test/fakeSupabase';

const fake = createFakeSupabase();
vi.mock('./supabaseClient', () => ({ supabase: fake.client }));

const { db } = await import('../db');
const ops = await import('./supabaseOperations');

const service = (overrides: Record<string, unknown> = {}) => ({
    clientId: 'c1',
    date: new Date(2026, 8, 30),
    nextServiceDate: new Date(2027, 2, 30),
    type: 'Limpeza',
    description: '',
    items: [{ type: 'Limpeza', description: '', quantity: 1, price: 150 }],
    photos: [],
    price: 150,
    status: 'Concluído' as const,
    paymentStatus: 'Pendente' as const,
    ...overrides,
});

const remoteRow = (id: string, extra: Record<string, unknown> = {}) => ({
    id, user_id: 'user-1', client_id: 'c1', date: '2026-09-10T03:00:00.000Z', price: '200', status: 'Concluído', ...extra,
});

beforeEach(async () => {
    await ops.clearLocalData();
    for (const name of ['clients', 'services', 'helpers', 'helper_entries', 'service_templates', 'settings', 'estimates']) {
        fake.table(name).clear();
    }
    fake.state.userId = 'user-1';
    fake.state.failUpserts = false;
    fake.state.upsertCalls = 0;
    fake.state.photoRowsDownloaded = 0;
    // Por padrão a conferência completa de fotos (1x/dia) já foi feita hoje
    localStorage.setItem('airtech:lastFullPhotoCheck', String(Date.now()));
});

describe('fila de sincronização', () => {
    it('grava localmente, enfileira e envia só o que mudou', async () => {
        const id = await ops.addService(service());
        expect(await db.services.get(id)).toBeTruthy();
        expect(await db.outbox.count()).toBe(1);

        await ops.flushOutbox();
        expect(await db.outbox.count()).toBe(0);
        const row = fake.table('services').get(id)!;
        expect(row.user_id).toBe('user-1');
        expect(row.client_id).toBe('c1');

        // Um sync sem alterações não reenvia nada
        fake.state.upsertCalls = 0;
        await ops.syncDatabase();
        expect(fake.state.upsertCalls).toBe(0);
    });

    it('mantém a fila quando o envio falha e reenvia depois', async () => {
        fake.state.failUpserts = true;
        const id = await ops.addService(service());
        await ops.flushOutbox();
        expect(await db.outbox.count()).toBe(1);
        expect(fake.table('services').has(id)).toBe(false);

        fake.state.failUpserts = false;
        const result = await ops.syncDatabase();
        expect(result.ok).toBe(true);
        expect(fake.table('services').has(id)).toBe(true);
    });

    it('exclusão feita offline é enviada e o item não volta', async () => {
        const id = await ops.addService(service());
        await ops.flushOutbox();

        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
        await ops.deleteService(id);
        await ops.flushOutbox();
        expect(fake.table('services').has(id)).toBe(true); // ainda não enviado

        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        await ops.syncDatabase();
        expect(fake.table('services').has(id)).toBe(false);
        expect(await db.services.get(id)).toBeUndefined();
    });

    it('remove localmente o que foi apagado em outro aparelho', async () => {
        fake.table('services').set('a', remoteRow('a'));
        fake.table('services').set('b', remoteRow('b'));
        await ops.syncDatabase();
        expect(await db.services.count()).toBe(2);

        fake.table('services').delete('b'); // apagado em outro aparelho
        await ops.syncDatabase();
        expect(await db.services.get('b')).toBeUndefined();
        expect(fake.table('services').has('b')).toBe(false); // não ressuscitou
    });

    it('não sobrescreve alteração local pendente com o valor da nuvem', async () => {
        fake.table('services').set('a', remoteRow('a'));
        await ops.syncDatabase();

        fake.state.failUpserts = true;
        await ops.updateService('a', { price: 999 });
        await ops.syncDatabase();
        expect((await db.services.get('a'))!.price).toBe(999);
    });

    it('não apaga dados locais se a nuvem voltar vazia', async () => {
        fake.table('services').set('a', remoteRow('a'));
        await ops.syncDatabase();
        fake.table('services').clear();
        await ops.syncDatabase();
        expect(await db.services.get('a')).toBeTruthy();
    });

    it('baixa mais de 1000 registros (paginação)', async () => {
        for (let i = 0; i < 1203; i++) {
            const id = `s${String(i).padStart(5, '0')}`;
            fake.table('services').set(id, remoteRow(id));
        }
        await ops.syncDatabase();
        expect(await db.services.count()).toBe(1203);
    });

    it('normaliza o que vem da nuvem (datas, valores e itens em texto)', async () => {
        fake.table('services').set('a', remoteRow('a', {
            date: '2026-10-01T03:00:00+00:00',
            items: '[{"price":"100","quantity":"2"}]',
        }));
        await ops.syncDatabase();
        const s = (await db.services.get('a'))!;
        expect(s.date).toBeInstanceOf(Date);
        expect(s.date.getMonth()).toBe(9); // outubro, não 30/09
        expect(s.price).toBe(200);
        expect(s.items![0].price).toBe(100);
        expect(s.items![0].quantity).toBe(2);
    });
});

describe('fotos nunca são perdidas', () => {
    const PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(200);

    it('envio em lote não apaga na nuvem as fotos de serviços sem o campo de fotos', async () => {
        // Serviço com fotos já na nuvem
        fake.table('services').set('a', remoteRow('a', { photos_before: [PHOTO] }));
        await ops.syncDatabase();

        // No aparelho, uma linha "sem campo de fotos" (ex.: registro antigo) e outra com fotos
        await db.services.put({ ...(await db.services.get('a'))!, photosBefore: undefined });
        await ops.addService(service({ photosBefore: [PHOTO] }));
        await ops.enqueueUpserts('services', ['a']);
        await ops.flushOutbox();

        expect(fake.table('services').get('a')!.photos_before).toEqual([PHOTO]);
    });

    it('se a nuvem perdeu as fotos e o aparelho ainda tem, mantém e reenvia', async () => {
        fake.table('services').set('a', remoteRow('a', { photos_before: [PHOTO] }));
        await ops.syncDatabase();

        // Nuvem perdeu as fotos (NULL); a conferência completa (1x/dia ou botão Sincronizar) recupera
        fake.table('services').set('a', remoteRow('a', { photos_before: null }));
        await ops.syncDatabase({ fullPhotos: true });

        expect((await db.services.get('a'))!.photosBefore).toEqual([PHOTO]);
        expect(fake.table('services').get('a')!.photos_before).toEqual([PHOTO]); // recuperada na nuvem
    });

    it('remoção intencional (lista vazia) é respeitada', async () => {
        fake.table('services').set('a', remoteRow('a', { photos_before: [PHOTO] }));
        await ops.syncDatabase();
        fake.table('services').set('a', remoteRow('a', { photos_before: [] }));
        await ops.syncDatabase({ fullPhotos: true });
        expect((await db.services.get('a'))!.photosBefore).toEqual([]);
    });

    it('aviso do Realtime truncado (registro > 1 MB) não apaga fotos nem itens', async () => {
        fake.table('services').set('a', remoteRow('a', {
            photos_before: [PHOTO],
            items: [{ type: 'Limpeza', description: 'Split 12k', quantity: 1, price: 200 }],
        }));
        await ops.syncDatabase();
        ops.subscribeToRealtime('user-1');

        // Como o Supabase manda quando o registro passa de 1 MB: só campos <= 64 bytes
        await fake.state.realtimeHandler!({
            eventType: 'UPDATE',
            table: 'services',
            new: { id: 'a', user_id: 'user-1', client_id: 'c1', status: 'Concluído' },
            old: null,
        });

        const s = (await db.services.get('a'))!;
        expect(s.photosBefore).toEqual([PHOTO]);
        expect(s.items).toHaveLength(1);
        ops.unsubscribeFromRealtime();
    });
});

describe('desempenho da sincronização', () => {
    const PHOTO = 'data:image/jpeg;base64,' + 'B'.repeat(200);

    it('sincronização normal não baixa de novo fotos que o aparelho já tem', async () => {
        for (let i = 0; i < 30; i++) fake.table('services').set(`s${i}`, remoteRow(`s${i}`, { photos_before: [PHOTO] }));
        await ops.syncDatabase(); // aparelho novo: baixa as fotos uma vez
        expect(fake.state.photoRowsDownloaded).toBeLessThanOrEqual(31); // 30 + 1 linha para descobrir as colunas
        expect((await db.services.get('s5'))!.photosBefore).toEqual([PHOTO]);

        fake.state.photoRowsDownloaded = 0;
        await ops.syncDatabase(); // próximas aberturas: só os dados
        expect(fake.state.photoRowsDownloaded).toBe(0);
        expect((await db.services.get('s5'))!.photosBefore).toEqual([PHOTO]); // fotos continuam no aparelho
    });

    it('envio não gera eco: o aviso do Realtime do próprio envio é ignorado', async () => {
        const id = await ops.addService(service({ photosBefore: [PHOTO] }));
        await ops.flushOutbox();
        ops.subscribeToRealtime('user-1');
        // Eco do envio (cortado, como vem acima de 1 MB): não deve buscar nada nem mexer no registro
        fake.state.photoRowsDownloaded = 0;
        await fake.state.realtimeHandler!({ eventType: 'UPDATE', table: 'services', new: { id, user_id: 'user-1' }, old: null });
        expect(fake.state.photoRowsDownloaded).toBe(0);
        expect((await db.services.get(id))!.photosBefore).toEqual([PHOTO]);
        ops.unsubscribeFromRealtime();
    });

    it('aviso completo do Realtime (registro pequeno) é usado direto', async () => {
        ops.subscribeToRealtime('user-1');
        await fake.state.realtimeHandler!({
            eventType: 'INSERT', table: 'clients',
            new: { id: 'cx', user_id: 'user-1', name: 'Cliente Novo', phone: '', address: '' }, old: null,
        });
        expect((await db.clients.get('cx'))!.name).toBe('Cliente Novo');
        ops.unsubscribeFromRealtime();
    });
});

describe('campos novos antes da migração do banco (agenda)', () => {
    beforeEach(() => { fake.state.missingColumns = {}; });

    it('coluna que não existe na nuvem: o resto sincroniza e o campo fica no aparelho', async () => {
        fake.state.missingColumns = { services: ['start_time', 'duration_minutes'] };
        const id = await ops.addService(service({ startTime: '13:00', durationMinutes: 180 }));
        await ops.syncDatabase();

        const remote = fake.table('services').get(id)!;
        expect(remote).toBeTruthy(); // o serviço subiu
        expect('start_time' in remote).toBe(false);
        expect(await db.outbox.count()).toBe(0);

        const local = (await db.services.get(id))!;
        expect(local.startTime).toBe('13:00'); // download não apagou o horário
        expect(local.durationMinutes).toBe(180);
    });

    it('depois da migração, o campo sincroniza normalmente', async () => {
        fake.state.missingColumns = { services: ['start_time'] };
        await ops.addService(service({ startTime: '08:00' }));
        await ops.syncDatabase(); // app descobre que a coluna falta

        fake.state.missingColumns = {}; // migração aplicada
        const id = await ops.addService(service({ startTime: '09:30' }));
        await ops.syncDatabase();
        expect(fake.table('services').get(id)!.start_time).toBe('09:30');
    });

    it('limpar um campo (null) chega na nuvem', async () => {
        const id = await ops.addService(service({ startTime: '09:30' }));
        await ops.syncDatabase();
        await ops.updateService(id, { startTime: null });
        await ops.syncDatabase();
        expect(fake.table('services').get(id)!.start_time).toBeNull();
    });

    it('campo de fotos vazio no aparelho nunca apaga as fotos da nuvem', async () => {
        fake.table('services').set('a', remoteRow('a', { photos_before: ['foto'] }));
        await ops.syncDatabase();
        await db.services.put({ ...(await db.services.get('a'))!, photosBefore: undefined });
        await ops.enqueueUpserts('services', ['a']);
        await ops.flushOutbox();
        expect(fake.table('services').get('a')!.photos_before).toEqual(['foto']);
    });
});

describe('troca de conta no mesmo aparelho', () => {
    it('limpa os dados da conta anterior antes de sincronizar', async () => {
        await ops.ensureLocalDataOwner('user-1');
        await ops.addClient({ name: 'Cliente A', phone: '', address: '', createdAt: new Date() });
        expect(await db.clients.count()).toBe(1);

        await ops.ensureLocalDataOwner('user-2');
        expect(await db.clients.count()).toBe(0);
        expect(await db.outbox.count()).toBe(0); // nada da conta anterior vai subir
    });

    it('mesma conta mantém os dados (inclusive pendências offline)', async () => {
        await ops.ensureLocalDataOwner('user-1');
        await ops.addClient({ name: 'Cliente A', phone: '', address: '', createdAt: new Date() });
        await ops.ensureLocalDataOwner('user-1');
        expect(await db.clients.count()).toBe(1);
        expect(await db.outbox.count()).toBe(1);
    });
});
