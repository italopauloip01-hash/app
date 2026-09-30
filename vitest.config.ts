import { defineConfig } from 'vitest/config';

// Os cálculos por mês dependem do fuso; os testes rodam no fuso do usuário (Brasil).
process.env.TZ = 'America/Sao_Paulo';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        setupFiles: ['src/test/setup.ts'],
    },
});
