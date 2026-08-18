-- ==============================================================================
-- AIRTECH PRO - SEGURANÇA REFORÇADA (ROW LEVEL SECURITY - RLS)
-- ==============================================================================
-- Execute este script no SQL Editor do Supabase para garantir proteção total:
-- 1. Ninguém pode ler, editar ou apagar dados de outro usuário.
-- 2. Toda requisição exige autenticação (auth.uid()).
-- ==============================================================================

-- 1. HABILITAR RLS EM TODAS AS TABELAS
ALTER TABLE IF EXISTS clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS services ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS helpers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS helper_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS service_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS estimates ENABLE ROW LEVEL SECURITY;

-- 2. REMOVER POLÍTICAS ANTIGAS (SE EXISTIREM) PARA EVITAR CONFLITO
DROP POLICY IF EXISTS "Usuário gerencia seus próprios clientes" ON clients;
DROP POLICY IF EXISTS "Usuário gerencia seus próprios serviços" ON services;
DROP POLICY IF EXISTS "Usuário gerencia seus próprios ajudantes" ON helpers;
DROP POLICY IF EXISTS "Usuário gerencia seus próprios lançamentos de ajudantes" ON helper_entries;
DROP POLICY IF EXISTS "Usuário gerencia seus próprios modelos de serviços" ON service_templates;
DROP POLICY IF EXISTS "Usuário gerencia suas próprias configurações" ON settings;
DROP POLICY IF EXISTS "Usuário gerencia seus próprios orçamentos" ON estimates;

-- 3. CRIAR POLÍTICAS RLS SEGURAS E ISOLADAS POR USUÁRIO

-- Tabela: clients
CREATE POLICY "Usuário gerencia seus próprios clientes"
ON clients
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Tabela: services
CREATE POLICY "Usuário gerencia seus próprios serviços"
ON services
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Tabela: helpers
CREATE POLICY "Usuário gerencia seus próprios ajudantes"
ON helpers
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Tabela: helper_entries
CREATE POLICY "Usuário gerencia seus próprios lançamentos de ajudantes"
ON helper_entries
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Tabela: service_templates
CREATE POLICY "Usuário gerencia seus próprios modelos de serviços"
ON service_templates
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Tabela: settings
CREATE POLICY "Usuário gerencia suas próprias configurações"
ON settings
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Tabela: estimates
CREATE POLICY "Usuário gerencia seus próprios orçamentos"
ON estimates
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. CRIAR ÍNDICES PARA PERFORMANCE MÁXIMA
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id);
CREATE INDEX IF NOT EXISTS idx_estimates_user_id ON estimates(user_id);
CREATE INDEX IF NOT EXISTS idx_helpers_user_id ON helpers(user_id);
CREATE INDEX IF NOT EXISTS idx_helper_entries_user_id ON helper_entries(user_id);
