-- =====================================================================
-- Reto Fitness Integral · esquema de base de datos para Supabase
-- Pega TODO este archivo en Supabase → SQL Editor → Run.
-- Se puede volver a correr sin perder datos.
-- =====================================================================

-- ---------- Tablas ----------
create table if not exists public.participantes (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null check (length(trim(nombre)) between 1 and 40),
  email        text not null unique check (email = lower(trim(email))),
  sexo         text not null check (sexo in ('F','M')),
  estatura_cm  numeric(5,1) not null check (estatura_cm between 120 and 220),
  es_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- corte: m0 = inicial (11 oct 2026), m1 = cierre Fase 1 (11 dic 2026), m2 = cierre Fase 2 (12 mar 2027)
create table if not exists public.mediciones (
  participante_id uuid not null references public.participantes(id) on delete cascade,
  corte         text not null check (corte in ('m0','m1','m2')),
  peso_kg       numeric(5,1) check (peso_kg between 30 and 250),
  grasa_bascula numeric(4,1) check (grasa_bascula between 3 and 70),
  cuello_cm     numeric(4,1) check (cuello_cm between 20 and 70),
  cintura_cm    numeric(5,1) check (cintura_cm between 40 and 200),
  cadera_cm     numeric(5,1) check (cadera_cm between 50 and 200),
  brazo_cm      numeric(4,1) check (brazo_cm between 15 and 70),
  muslo_cm      numeric(5,1) check (muslo_cm between 30 and 100),
  updated_at    timestamptz not null default now(),
  primary key (participante_id, corte)
);

-- semana = lunes de la semana (la primera es el 12 oct 2026)
create table if not exists public.semanas (
  participante_id uuid not null references public.participantes(id) on delete cascade,
  semana     date not null check (extract(isodow from semana) = 1),
  sesiones   int  not null check (sesiones between 0 and 7),
  pasos      int  not null check (pasos between 0 and 60000),
  updated_at timestamptz not null default now(),
  primary key (participante_id, semana)
);

-- ---------- Funciones de permisos ----------
-- Correo de quien está conectado (viene del login de Supabase)
create or replace function public.mi_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.es_miembro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from participantes where email = mi_email())
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from participantes where email = mi_email() and es_admin)
$$;

create or replace function public.es_mio(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from participantes where id = pid and email = mi_email())
$$;

-- ---------- Seguridad por filas (RLS) ----------
alter table public.participantes enable row level security;
alter table public.mediciones    enable row level security;
alter table public.semanas       enable row level security;

-- Participantes: todos los del reto ven la lista; solo el admin agrega, edita o quita.
drop policy if exists p_ver    on public.participantes;
drop policy if exists p_crear  on public.participantes;
drop policy if exists p_editar on public.participantes;
drop policy if exists p_borrar on public.participantes;
create policy p_ver    on public.participantes for select to authenticated using (es_miembro());
create policy p_crear  on public.participantes for insert to authenticated with check (es_admin());
create policy p_editar on public.participantes for update to authenticated using (es_admin()) with check (es_admin());
create policy p_borrar on public.participantes for delete to authenticated using (es_admin());

-- Mediciones y semanas: todos ven todo (es un reto); cada quien escribe lo suyo; el admin puede corregir cualquiera.
drop policy if exists m_ver    on public.mediciones;
drop policy if exists m_crear  on public.mediciones;
drop policy if exists m_editar on public.mediciones;
drop policy if exists m_borrar on public.mediciones;
create policy m_ver    on public.mediciones for select to authenticated using (es_miembro());
create policy m_crear  on public.mediciones for insert to authenticated with check (es_admin() or es_mio(participante_id));
create policy m_editar on public.mediciones for update to authenticated using (es_admin() or es_mio(participante_id)) with check (es_admin() or es_mio(participante_id));
create policy m_borrar on public.mediciones for delete to authenticated using (es_admin() or es_mio(participante_id));

drop policy if exists s_ver    on public.semanas;
drop policy if exists s_crear  on public.semanas;
drop policy if exists s_editar on public.semanas;
drop policy if exists s_borrar on public.semanas;
create policy s_ver    on public.semanas for select to authenticated using (es_miembro());
create policy s_crear  on public.semanas for insert to authenticated with check (es_admin() or es_mio(participante_id));
create policy s_editar on public.semanas for update to authenticated using (es_admin() or es_mio(participante_id)) with check (es_admin() or es_mio(participante_id));
create policy s_borrar on public.semanas for delete to authenticated using (es_admin() or es_mio(participante_id));

-- Nadie sin sesión puede leer ni escribir.
revoke all on public.participantes, public.mediciones, public.semanas from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.participantes, public.mediciones, public.semanas to authenticated;
grant execute on function public.mi_email(), public.es_miembro(), public.es_admin(), public.es_mio(uuid) to authenticated;

-- ---------- Registro: solo correos inscritos pueden crear cuenta ----------
-- Cualquier cuenta nueva (desde la app o desde el panel) debe tener un correo que ya esté en participantes.
create or replace function public.solo_inscritos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.participantes where email = lower(new.email)) then
    raise exception 'correo_no_inscrito';
  end if;
  return new;
end $$;
revoke execute on function public.solo_inscritos() from public, anon, authenticated;

drop trigger if exists solo_inscritos on auth.users;
create trigger solo_inscritos before insert on auth.users
  for each row execute function public.solo_inscritos();

-- =====================================================================
-- PRIMER PASO DESPUÉS DE CORRER ESTO: agrégate como administradora.
-- Cambia nombre, correo, sexo y estatura y corre solo estas líneas:
--
-- insert into public.participantes (nombre, email, sexo, estatura_cm, es_admin)
-- values ('Kats', 'kzabaleta.28@gmail.com', 'F', 160, true);
--
-- A los demás los agregas desde la app, en la pestaña Participantes.
-- =====================================================================
