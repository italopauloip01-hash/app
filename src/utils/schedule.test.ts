import { describe, it, expect } from 'vitest';
import {
    estimateDuration, itemDuration, dayBlocks, findConflicts, suggestSlots, freeRanges,
    bookedMinutes, toMinutes, fromMinutes, formatDuration, dayEarnings,
} from './schedule';

const svc = (id: string, startTime: string, items: { type: string; quantity?: number }[], extra = {}) => ({
    id, date: new Date(2026, 9, 5), startTime, items, status: 'Agendado', ...extra,
});

describe('duração estimada', () => {
    it('usa regra pelo tipo quando o serviço padrão não tem tempo', () => {
        expect(itemDuration({ type: 'Instalação Split 12000' })).toBe(180);
        expect(itemDuration({ type: 'Desinstalação' })).toBe(90); // não confunde com instalação
        expect(itemDuration({ type: 'Limpeza' })).toBe(60);
        expect(itemDuration({ type: 'Outro qualquer' })).toBe(60);
    });

    it('serviço padrão com tempo definido tem prioridade', () => {
        expect(itemDuration({ type: 'Instalação 9k' }, [{ name: 'instalação 9k', durationMinutes: 150 }])).toBe(150);
    });

    it('soma itens x quantidade', () => {
        expect(estimateDuration([{ type: 'Instalação', quantity: 2 }, { type: 'Limpeza', quantity: 1 }])).toBe(420);
    });
});

describe('agenda do dia', () => {
    // Duas instalações: 08:00-11:00 e 13:00-16:00
    const services = [
        svc('a', '08:00', [{ type: 'Instalação' }]),
        svc('b', '13:00', [{ type: 'Instalação' }]),
        svc('c', '10:00', [{ type: 'Limpeza' }], { status: 'Cancelado' }), // não ocupa
        svc('d', '09:00', [{ type: 'Limpeza' }], { date: new Date(2026, 9, 6) }), // outro dia
        { id: 'e', date: new Date(2026, 9, 5), items: [{ type: 'Limpeza' }], status: 'Agendado' }, // sem horário
    ];
    const blocks = dayBlocks(services, '2026-10-05');

    it('considera só os serviços com horário, do dia e não cancelados', () => {
        expect(blocks.map(b => b.service.id)).toEqual(['a', 'b']);
        expect(blocks.map(b => [fromMinutes(b.start), fromMinutes(b.end)])).toEqual([['08:00', '11:00'], ['13:00', '16:00']]);
    });

    it('detecta choque de horário, incluindo o deslocamento', () => {
        expect(findConflicts(blocks, toMinutes('10:00'), 60).map(b => b.service.id)).toEqual(['a']);
        // 11:00 encosta no fim da instalação: sem os 30 min de deslocamento, choca
        expect(findConflicts(blocks, toMinutes('11:00'), 60).map(b => b.service.id)).toEqual(['a']);
        expect(findConflicts(blocks, toMinutes('11:30'), 60)).toEqual([]);
        // limpeza de 1h às 12:00 termina 13:00: sem folga para chegar na instalação das 13:00
        expect(findConflicts(blocks, toMinutes('12:00'), 60).map(b => b.service.id)).toEqual(['b']);
    });

    it('sugere horários livres onde o serviço cabe', () => {
        expect(suggestSlots(blocks, 60)).toEqual(['11:30', '16:30', '17:00']);
        expect(suggestSlots(blocks, 180)).toEqual([]); // outra instalação não cabe mais
    });

    it('faixas livres e tempo ocupado', () => {
        expect(freeRanges(blocks).map(r => [fromMinutes(r.start), fromMinutes(r.end)])).toEqual([['11:30', '12:30'], ['16:30', '18:00']]);
        expect(bookedMinutes(blocks)).toBe(180 + 180 + 30);
    });

    it('ao editar, o próprio serviço não conta como choque', () => {
        const without = dayBlocks(services, '2026-10-05', [], 'a');
        expect(findConflicts(without, toMinutes('08:00'), 180)).toEqual([]);
    });
});

describe('ganho do dia', () => {
    const d5 = new Date(2026, 9, 5);
    const services = [
        { date: d5, status: 'Concluído', paymentStatus: 'Pago', items: [{ price: 600, quantity: 1 }], price: 600 },
        { date: d5, status: 'Agendado', paymentStatus: 'Pendente', items: [{ price: '180,00', quantity: 2 }], price: 0 },
        { date: d5, status: 'Cancelado', paymentStatus: 'Pendente', price: 999 }, // não conta
        { date: new Date(2026, 9, 6), status: 'Concluído', paymentStatus: 'Pago', price: 500 }, // outro dia
        { date: '2026-10-05T03:00:00+00:00', status: 'Concluído', paymentStatus: 'Pago', price: '100' }, // vindo da nuvem
    ];
    const helpers = [
        { date: d5, type: 'work', amount: 150 },
        { date: d5, type: 'payment', amount: 150 }, // pagamento ao ajudante não é custo novo
        { date: new Date(2026, 9, 6), type: 'work', amount: 80 },
    ];

    it('soma pagos e a receber, desconta ajudantes e ignora cancelados', () => {
        expect(dayEarnings(services, helpers, '2026-10-05')).toEqual({
            total: 1060, received: 700, pending: 360, helperCost: 150, profit: 910, count: 3,
        });
    });

    it('dia vazio', () => {
        expect(dayEarnings(services, helpers, '2026-10-10')).toEqual({
            total: 0, received: 0, pending: 0, helperCost: 0, profit: 0, count: 0,
        });
    });
});

describe('formatação', () => {
    it('formata duração', () => {
        expect(formatDuration(45)).toBe('45 min');
        expect(formatDuration(180)).toBe('3h');
        expect(formatDuration(150)).toBe('2h30');
    });
});
