import { describe, it, expect } from 'vitest';
import { isOwed } from './debt';

describe('o que é dívida do cliente', () => {
    it('serviço feito e não pago é dívida', () => {
        expect(isOwed({ status: 'Concluído', paymentStatus: 'Pendente' })).toBe(true);
        expect(isOwed({ status: 'Pendente', paymentStatus: 'Pendente' })).toBe(true);
    });

    it('agendado (ainda não feito) não é dívida', () => {
        expect(isOwed({ status: 'Agendado', paymentStatus: 'Pendente' })).toBe(false);
    });

    it('cancelado e pago não são dívida', () => {
        expect(isOwed({ status: 'Cancelado', paymentStatus: 'Pendente' })).toBe(false);
        expect(isOwed({ status: 'Concluído', paymentStatus: 'Pago' })).toBe(false);
    });
});
