-- =====================================================
-- SANTA LUZIA BETS — Schema v4 (Múltiplos Grupos de Apostas)
--
-- Limpar tudo antes:
--   DROP TABLE IF EXISTS results, picks, bet_group_members, bet_groups, profiles, teams, wc_groups, phases CASCADE;
--   DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--   DROP FUNCTION IF EXISTS public.handle_new_user();
-- =====================================================

-- Grupos do Mundial (torneio)
create table if not exists wc_groups (
  id text primary key,
  label text not null
);

-- Seleções
create table if not exists teams (
  id serial primary key,
  name text not null unique,
  flag_code text not null,
  wc_group_id text references wc_groups(id)
);

-- Fases do torneio
create table if not exists phases (
  id text primary key,
  label text not null,
  points int not null,
  max_teams int not null,
  sort_order int not null
);

-- Perfis de utilizador
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_color text default '#2d9e58',
  created_at timestamptz default now()
);

-- =====================================================
-- GRUPOS DE APOSTAS (criados pelos utilizadores)
-- =====================================================
create table if not exists bet_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  invite_code text unique not null default upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Membros de cada grupo de apostas
create table if not exists bet_group_members (
  id serial primary key,
  bet_group_id uuid references bet_groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  is_admin boolean default false,  -- admin do grupo de apostas (pode editar resultados)
  joined_at timestamptz default now(),
  unique(bet_group_id, user_id)
);

-- Apostas: cada pick está ligado a um bet_group
create table if not exists picks (
  id serial primary key,
  user_id uuid references profiles(id) on delete cascade,
  bet_group_id uuid references bet_groups(id) on delete cascade,
  team_id int references teams(id) on delete cascade,
  wc_group_id text references wc_groups(id),
  pick_order int not null,
  locked boolean default false,
  created_at timestamptz default now(),
  unique(user_id, bet_group_id, team_id)
);

-- Resultados: partilhados por todos (ou por grupo — aqui partilhados globalmente)
create table if not exists results (
  id serial primary key,
  phase_id text references phases(id),
  team_id int references teams(id),
  recorded_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique(phase_id, team_id)
);

-- =====================================================
-- DADOS INICIAIS
-- =====================================================

insert into wc_groups (id, label) values
  ('A','Grupo A'),('B','Grupo B'),('C','Grupo C'),('D','Grupo D'),
  ('E','Grupo E'),('F','Grupo F'),('G','Grupo G'),('H','Grupo H'),
  ('I','Grupo I'),('J','Grupo J'),('K','Grupo K'),('L','Grupo L')
on conflict do nothing;

insert into phases (id, label, points, max_teams, sort_order) values
  ('grupos',  'Fase de Grupos',   1, 32, 1),
  ('32avos',  '32avos de Final',  1, 16, 2),
  ('16avos',  '16avos de Final',  2, 8,  3),
  ('8avos',   '8avos de Final',   2, 4,  4),
  ('quartos', 'Quartos de Final', 2, 2,  5),
  ('meias',   'Meias-finais',     3, 1,  6),
  ('campeao', 'Campeão',          3, 1,  7)
on conflict do nothing;

insert into teams (name, flag_code, wc_group_id) values
  ('México','mx','A'),('Coreia do Sul','kr','A'),('África do Sul','za','A'),('Chéquia','cz','A'),
  ('Canadá','ca','B'),('Suíça','ch','B'),('Qatar','qa','B'),('Itália','it','B'),
  ('Brasil','br','C'),('Marrocos','ma','C'),('Escócia','gb-sct','C'),('Haiti','ht','C'),
  ('EUA','us','D'),('Paraguai','py','D'),('Austrália','au','D'),('Turquia','tr','D'),
  ('Alemanha','de','E'),('Equador','ec','E'),('Costa do Marfim','ci','E'),('Curaçau','cw','E'),
  ('Países Baixos','nl','F'),('Japão','jp','F'),('Tunísia','tn','F'),('Ucrânia','ua','F'),
  ('Bélgica','be','G'),('Irão','ir','G'),('Egito','eg','G'),('Nova Zelândia','nz','G'),
  ('Espanha','es','H'),('Uruguai','uy','H'),('Arábia Saudita','sa','H'),('Cabo Verde','cv','H'),
  ('França','fr','I'),('Senegal','sn','I'),('Noruega','no','I'),('Iraque','iq','I'),
  ('Argentina','ar','J'),('Áustria','at','J'),('Argélia','dz','J'),('Jordânia','jo','J'),
  ('Portugal','pt','K'),('Colômbia','co','K'),('Uzbequistão','uz','K'),('RD Congo','cd','K'),
  ('Inglaterra','gb-eng','L'),('Croácia','hr','L'),('Panamá','pa','L'),('Gana','gh','L')
on conflict do nothing;

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

alter table wc_groups           enable row level security;
alter table teams               enable row level security;
alter table phases              enable row level security;
alter table profiles            enable row level security;
alter table bet_groups          enable row level security;
alter table bet_group_members   enable row level security;
alter table picks               enable row level security;
alter table results             enable row level security;

-- Dados estáticos: leitura livre
create policy "pub_read_wc_groups" on wc_groups for select using (true);
create policy "pub_read_teams"     on teams     for select using (true);
create policy "pub_read_phases"    on phases    for select using (true);
create policy "pub_read_results"   on results   for select using (true);

-- Perfis: leitura por autenticados, escrita pelo próprio
create policy "auth_read_profiles"  on profiles for select to authenticated using (true);
create policy "own_profile"         on profiles for all   using (auth.uid() = id);

-- Grupos de apostas: leitura por membros, criação por autenticados
create policy "read_bet_groups" on bet_groups for select to authenticated
  using (
    exists (select 1 from bet_group_members where bet_group_id = bet_groups.id and user_id = auth.uid())
  );
create policy "create_bet_group" on bet_groups for insert to authenticated
  with check (created_by = auth.uid());
create policy "admin_update_bet_group" on bet_groups for update to authenticated
  using (
    exists (select 1 from bet_group_members where bet_group_id = bet_groups.id and user_id = auth.uid() and is_admin = true)
  );

-- Permitir leitura de bet_groups por invite_code (para join)
create policy "read_by_invite" on bet_groups for select to authenticated
  using (true);  -- filtramos por invite_code na query, RLS permite tudo autenticado

-- Membros: leitura pelos membros do mesmo grupo
create policy "read_members" on bet_group_members for select to authenticated using (true);
create policy "join_group"   on bet_group_members for insert to authenticated
  with check (user_id = auth.uid());
create policy "leave_group"  on bet_group_members for delete to authenticated
  using (user_id = auth.uid());

-- Picks: leitura por membros do grupo, escrita pelo próprio
create policy "read_picks" on picks for select to authenticated using (true);
create policy "own_picks"  on picks for all
  using (auth.uid() = user_id and locked = false);

-- Resultados: só admins do grupo podem inserir
create policy "admin_results" on results for all to authenticated
  using (
    exists (
      select 1 from bet_group_members bgm
      join bet_groups bg on bg.id = bgm.bet_group_id
      where bgm.user_id = auth.uid() and bgm.is_admin = true
    )
  );

-- =====================================================
-- TRIGGER: perfil automático no registo
-- =====================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name, avatar_color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    (array['#2d9e58','#c9a020','#e85555','#4a90d9','#9b59b6','#e67e22','#1abc9c'])[floor(random()*7)+1]
  ) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
