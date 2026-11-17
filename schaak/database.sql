-- RTT SCHAAK: de database (Supabase-project RTT APP, migratie 'schaak_spel').
-- De tabel is dicht (RLS aan, geen regels). De pagina praat alleen met de vier functies hieronder.
-- Wie mag zetten hangt aan een geheim token per speler: de pagina bewaart het in de browser, de database
-- bewaart alleen de sha256 ervan. De code van een spel (in de uitnodigingslink) geeft alleen kijkrecht en
-- het recht om de vrije stoel te nemen.
-- De database kijkt NIET of een zet volgens de schaakregels mag: dat doen beide browsers (regels.js).
-- Hij bewaakt wel wie aan de beurt is en dat geen zet twee keer wordt gedaan.

create table if not exists public.schaak_spel (
  code         text primary key,
  wit_hash     text,
  zwart_hash   text,
  naam_wit     text,
  naam_zwart   text,
  zetten       text[] not null default '{}',
  uitslag      text,                 -- null = loopt (of geeindigd op het bord), 'w', 'b', 'remise'
  reden        text,                 -- 'opgegeven', 'overeengekomen'
  remise_van   text,                 -- 'w' of 'b' biedt remise aan
  revanche     text,                 -- code van het volgende spel
  gezien_wit   timestamptz,
  gezien_zwart timestamptz,
  gemaakt      timestamptz not null default now(),
  bijgewerkt   timestamptz not null default now()
);
alter table public.schaak_spel enable row level security;
revoke all on public.schaak_spel from anon, authenticated;

create or replace function public.schaak_hash(p text) returns text
language sql immutable set search_path = '' as
$$ select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex') $$;

create or replace function public.schaak_code() returns text
language plpgsql volatile set search_path = '' as $$
declare a constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..8 loop c := c || substr(a, 1 + floor(random() * 32)::int, 1); end loop;
    exit when not exists (select 1 from public.schaak_spel where code = c);
  end loop;
  return c;
end $$;

create or replace function public.schaak_naam(p text) returns text
language sql immutable set search_path = '' as
$$ select nullif(left(btrim(regexp_replace(coalesce(p, ''), '[<>&"''[:cntrl:]]', '', 'g')), 20), '') $$;

-- Nieuw spel. p_kleur: 'w' (rood, begint), 'b' (zwart) of iets anders = loten.
create or replace function public.schaak_nieuw(p_kleur text, p_naam text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare c text; t text; k text;
begin
  delete from public.schaak_spel where bijgewerkt < now() - interval '60 days';
  if (select count(*) from public.schaak_spel where gemaakt > now() - interval '1 hour') >= 300 then
    raise exception 'Te veel nieuwe spellen. Probeer het over een uur opnieuw.';
  end if;
  c := public.schaak_code();
  t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  k := case when p_kleur in ('w', 'b') then p_kleur when random() < 0.5 then 'w' else 'b' end;
  insert into public.schaak_spel (code, wit_hash, zwart_hash, naam_wit, naam_zwart, gezien_wit, gezien_zwart)
  values (c, case when k = 'w' then public.schaak_hash(t) end, case when k = 'b' then public.schaak_hash(t) end,
          case when k = 'w' then public.schaak_naam(p_naam) end, case when k = 'b' then public.schaak_naam(p_naam) end,
          case when k = 'w' then now() end, case when k = 'b' then now() end);
  return jsonb_build_object('code', c, 'token', t, 'kleur', k);
end $$;

-- De uitgenodigde neemt de vrije stoel. Zijn beide stoelen bezet, dan kijk je mee.
create or replace function public.schaak_meedoen(p_code text, p_naam text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.schaak_spel; t text;
begin
  select * into s from public.schaak_spel where code = upper(p_code) for update;
  if not found then raise exception 'Dit spel bestaat niet (meer).'; end if;
  t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  if s.wit_hash is null then
    update public.schaak_spel set wit_hash = public.schaak_hash(t), naam_wit = public.schaak_naam(p_naam),
           gezien_wit = now(), bijgewerkt = now() where code = s.code;
    return jsonb_build_object('code', s.code, 'token', t, 'kleur', 'w');
  elsif s.zwart_hash is null then
    update public.schaak_spel set zwart_hash = public.schaak_hash(t), naam_zwart = public.schaak_naam(p_naam),
           gezien_zwart = now(), bijgewerkt = now() where code = s.code;
    return jsonb_build_object('code', s.code, 'token', t, 'kleur', 'b');
  end if;
  return jsonb_build_object('code', s.code, 'token', null, 'kleur', 'kijker');
end $$;

-- De stand. p_vanaf = hoeveel zetten de pagina al heeft; alleen de rest komt mee.
create or replace function public.schaak_stand(p_code text, p_token text, p_vanaf int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.schaak_spel; h text := public.schaak_hash(p_token); k text := 'kijker'; v int := greatest(coalesce(p_vanaf, 0), 0);
begin
  select * into s from public.schaak_spel where code = upper(p_code);
  if not found then raise exception 'Dit spel bestaat niet (meer).'; end if;
  if p_token is not null and p_token <> '' then
    if s.wit_hash = h then k := 'w'; elsif s.zwart_hash = h then k := 'b'; end if;
  end if;
  if k = 'w' and (s.gezien_wit is null or s.gezien_wit < now() - interval '4 seconds') then
    update public.schaak_spel set gezien_wit = now() where code = s.code; s.gezien_wit := now();
  elsif k = 'b' and (s.gezien_zwart is null or s.gezien_zwart < now() - interval '4 seconds') then
    update public.schaak_spel set gezien_zwart = now() where code = s.code; s.gezien_zwart := now();
  end if;
  return jsonb_build_object(
    'code', s.code, 'kleur', k, 'n', cardinality(s.zetten),
    'zetten', coalesce(to_jsonb(s.zetten[v + 1:]), '[]'::jsonb),
    'naam_wit', s.naam_wit, 'naam_zwart', s.naam_zwart,
    'bezet_wit', s.wit_hash is not null, 'bezet_zwart', s.zwart_hash is not null,
    'online_wit', coalesce(s.gezien_wit > now() - interval '12 seconds', false),
    'online_zwart', coalesce(s.gezien_zwart > now() - interval '12 seconds', false),
    'uitslag', s.uitslag, 'reden', s.reden, 'remise_van', s.remise_van, 'revanche', s.revanche);
end $$;

-- Een zet. p_n = het nummer van deze zet (0 = de eerste). Klopt dat niet, dan is er niets gebeurd (ok false).
create or replace function public.schaak_zet(p_code text, p_token text, p_n int, p_zet text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.schaak_spel; h text := public.schaak_hash(p_token); n int;
begin
  select * into s from public.schaak_spel where code = upper(p_code) for update;
  if not found then raise exception 'Dit spel bestaat niet (meer).'; end if;
  n := cardinality(s.zetten);
  if s.uitslag is not null then return jsonb_build_object('ok', false, 'n', n, 'waarom', 'afgelopen'); end if;
  if p_n is distinct from n then return jsonb_build_object('ok', false, 'n', n, 'waarom', 'nummer'); end if;
  if p_token is null or p_token = '' or (case when n % 2 = 0 then s.wit_hash else s.zwart_hash end) is distinct from h then
    raise exception 'Je bent niet aan de beurt.';
  end if;
  if p_zet !~ '^[a-h][1-8][a-h][1-8][qrbn]?$' or n >= 1000 then raise exception 'Ongeldige zet.'; end if;
  update public.schaak_spel set zetten = zetten || p_zet, remise_van = null, bijgewerkt = now() where code = s.code;
  return jsonb_build_object('ok', true, 'n', n + 1);
end $$;

-- Opgeven, remise aanbieden/aannemen/weigeren, revanche (nieuw spel met de kleuren om, dezelfde tokens).
create or replace function public.schaak_actie(p_code text, p_token text, p_actie text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.schaak_spel; h text := public.schaak_hash(p_token); k text; ander text; c text;
begin
  select * into s from public.schaak_spel where code = upper(p_code) for update;
  if not found then raise exception 'Dit spel bestaat niet (meer).'; end if;
  if p_token is null or p_token = '' then raise exception 'Alleen de spelers kunnen dit.'; end if;
  if s.wit_hash = h then k := 'w'; ander := 'b'; elsif s.zwart_hash = h then k := 'b'; ander := 'w';
  else raise exception 'Alleen de spelers kunnen dit.'; end if;
  if p_actie = 'opgeven' and s.uitslag is null then
    update public.schaak_spel set uitslag = ander, reden = 'opgegeven', remise_van = null, bijgewerkt = now() where code = s.code;
  elsif p_actie = 'remise' and s.uitslag is null then
    if s.remise_van = ander then
      update public.schaak_spel set uitslag = 'remise', reden = 'overeengekomen', remise_van = null, bijgewerkt = now() where code = s.code;
    else
      update public.schaak_spel set remise_van = k, bijgewerkt = now() where code = s.code;
    end if;
  elsif p_actie = 'remise_nee' then
    update public.schaak_spel set remise_van = null, bijgewerkt = now() where code = s.code;
  elsif p_actie = 'revanche' then
    if s.revanche is null then
      c := public.schaak_code();
      insert into public.schaak_spel (code, wit_hash, zwart_hash, naam_wit, naam_zwart)
      values (c, s.zwart_hash, s.wit_hash, s.naam_zwart, s.naam_wit);
      update public.schaak_spel set revanche = c, bijgewerkt = now() where code = s.code;
    else
      c := s.revanche;
    end if;
    return jsonb_build_object('ok', true, 'revanche', c);
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.schaak_hash(text), public.schaak_code(), public.schaak_naam(text) from public, anon, authenticated;
revoke all on function public.schaak_nieuw(text, text), public.schaak_meedoen(text, text), public.schaak_stand(text, text, int),
  public.schaak_zet(text, text, int, text), public.schaak_actie(text, text, text) from public;
grant execute on function public.schaak_nieuw(text, text), public.schaak_meedoen(text, text), public.schaak_stand(text, text, int),
  public.schaak_zet(text, text, int, text), public.schaak_actie(text, text, text) to anon, authenticated;
