# AirTech Pro

App de gestão para técnicos de climatização: clientes, serviços, orçamentos, ajudantes,
lembretes de manutenção, recibos/extratos e faturamento mensal.

Roda como **PWA** (publicado na Vercel) e como **app Android** (Capacitor).

## Stack

- React 19 + TypeScript + Vite 7 + Tailwind 4
- **Dexie (IndexedDB)** como banco local — o app funciona offline
- **Supabase** (Auth + Postgres + Realtime) como nuvem
- Capacitor 8 para Android (Filesystem, Share, Geolocation)

## Comandos

```bash
npm install
npm run dev       # servidor local em http://localhost:5173
npm test          # testes (Vitest) — somas mensais e sincronização
npm run lint
npm run build     # gera dist/ (web + PWA)
```

### Android

O APK empacota a pasta `dist/`. Toda correção só chega ao celular depois de:

```bash
npm run build
npx cap sync android
```

e gerar/instalar o APK novamente pelo Android Studio.

### Ícone

A fonte do ícone é `assets/icon.svg`. Os PNGs do site/PWA ficam em `public/`
(`favicon`, `apple-touch-icon`, `pwa-*`, incluindo a versão `maskable`). Para o Android,
`assets/icon-only.png`, `icon-foreground.png` e `icon-background.png` alimentam:

```bash
npx @capacitor/assets generate --android
```

## Arquitetura de dados

```
Tela ──lê──▶ hooks/useData.ts (useLiveQuery) ──▶ Dexie
Tela ──grava─▶ lib/supabaseOperations.ts ──▶ Dexie + fila `outbox` ──▶ Supabase
```

- **Offline-first:** toda gravação vai primeiro para o Dexie e entra na fila `outbox`
  (na mesma transação). A fila é enviada ao Supabase em segundo plano; se estiver sem
  internet ou der erro, fica guardada e é reenviada depois.
- **Sincronização (`syncDatabase`):** envia a fila, depois baixa tudo do Supabase
  (paginado, 1000 por vez). Registros com alteração local pendente não são sobrescritos.
  Registros que sumiram da nuvem (apagados em outro aparelho) são removidos localmente.
- **Realtime:** alterações feitas em outro aparelho chegam por WebSocket.
- **Normalização (`utils/normalize.ts`):** o Supabase devolve datas como texto e às vezes
  números/JSON como texto. Tudo que chega é convertido (datas → `Date`, valores → `number`,
  `items` → array) antes de ir para o Dexie. Isso é o que mantém as somas por mês corretas.
- **Datas:** use sempre `parseLocalDate` / `getYearMonth` de `utils/dateUtils.ts`.
  Nunca `new Date("2026-10-01")` — o JavaScript lê isso como UTC e, no Brasil, vira 30/09.
- **Troca de conta:** se outra conta logar no mesmo aparelho, os dados locais da conta
  anterior são apagados antes de sincronizar (`ensureLocalDataOwner`).

## Backup

- **Manual** (Configurações): gera um JSON (sem fotos, por tamanho) para compartilhar/baixar.
- **Automático** (só no app Android): a cada 3h salva em `Documentos/AirTechPro`,
  mantendo os 5 mais recentes.
- **Restaurar:** substitui os dados locais pelos do arquivo, preservando as fotos já
  existentes, e envia o resultado para a nuvem.

## Segurança

`supabase_security_rules.sql` ativa Row Level Security: cada usuário só acessa as próprias
linhas (`user_id = auth.uid()`). A chave `anon` no código é pública por design; a proteção
vem do RLS.
