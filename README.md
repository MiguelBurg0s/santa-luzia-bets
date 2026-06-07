# ⚽ Santa Luzia Bets — v4 MPA

## Estrutura de ficheiros
```
/
├── index.html        → Login / Registo
├── lobby.html        → Os meus grupos
├── pages/
│   └── group.html    → Grupo de apostas (?id=UUID)
├── css/style.css
├── js/shared.js      → Supabase, utilitários partilhados
└── schema.sql        → Base de dados Supabase
```

## Navegação (URLs reais)
| URL | Página |
|---|---|
| `/` | Login |
| `/lobby.html` | Lista de grupos |
| `/lobby.html?join=CÓDIGO` | Entrar num grupo pelo link de convite |
| `/pages/group.html?id=UUID` | Grupo de apostas |
| `/pages/group.html?id=UUID#ranking` | Tab ranking do grupo |

## Setup (igual às versões anteriores)

### 1. Supabase
```sql
-- Limpar (se já tens tabelas):
DROP TABLE IF EXISTS results, picks, bet_group_members, bet_groups, profiles, teams, phases, wc_groups CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
```
Depois corre o `schema.sql` completo.

### 2. Credenciais
Em `js/shared.js`:
```js
const SUPABASE_URL      = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';
```

### 3. Supabase → Authentication → URL Configuration
- **Site URL**: `https://o-teu-site.netlify.app`
- **Redirect URLs**: `https://o-teu-site.netlify.app/lobby.html`

### 4. Netlify
Arrasta a pasta para o Netlify. Adiciona um ficheiro `_redirects`:
```
/* /index.html 200
```
(Já está incluído no ZIP)

## Vantagens da MPA
- Cada página tem URL próprio — o browser gere a navegação
- Mudar de tab e voltar não perde o estado
- O botão "back" funciona nativamente
- Tabs do grupo usam `#hash` — o browser guarda no histórico
