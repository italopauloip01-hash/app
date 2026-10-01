-- ==============================================================================
-- AIRTECH PRO - AGENDA (horário e duração dos serviços)
-- ==============================================================================
-- Execute uma vez no SQL Editor do Supabase. Só ADICIONA colunas (não altera nem
-- apaga dados) e pode ser rodado de novo sem problema.
--
-- Antes de rodar, a agenda já funciona em cada aparelho; o que este script libera é
-- a sincronização do horário/duração entre aparelhos.
-- ==============================================================================

-- Horário marcado ('HH:mm') e duração prevista (minutos) de cada serviço
ALTER TABLE services ADD COLUMN IF NOT EXISTS start_time text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_minutes integer;

-- Tempo médio de cada serviço padrão (usado para estimar a duração)
ALTER TABLE service_templates ADD COLUMN IF NOT EXISTS duration_minutes integer;

-- Expediente ('HH:mm'), usado para sugerir horários livres
ALTER TABLE settings ADD COLUMN IF NOT EXISTS work_start text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS work_end text;

-- Faz a API do Supabase enxergar as colunas novas imediatamente
NOTIFY pgrst, 'reload schema';
