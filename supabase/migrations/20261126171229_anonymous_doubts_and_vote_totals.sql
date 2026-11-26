begin;
alter table public.doubts add column anonymous boolean not null default false;
alter table public.doubts add column public_author_id uuid generated always as (case when anonymous then null else author_id end) stored;
revoke select on public.doubts from authenticated;
grant select(id,public_author_id,anonymous,question,subject,status,created_at) on public.doubts to authenticated;
grant insert(anonymous) on public.doubts to authenticated;
create table public.doubt_votes (
 doubt_id uuid not null references public.doubts(id) on delete cascade,
 voter_id uuid not null references public.profiles(id) on delete cascade,
 primary key(doubt_id,voter_id)
);
alter table public.doubt_votes enable row level security;
revoke all on public.doubt_votes from anon, authenticated;
grant select,insert,delete on public.doubt_votes to authenticated;
create policy doubt_votes_read on public.doubt_votes for select to authenticated using(voter_id=(select auth.uid()));
create policy doubt_votes_insert on public.doubt_votes for insert to authenticated with check(voter_id=(select auth.uid()));
create policy doubt_votes_delete on public.doubt_votes for delete to authenticated using(voter_id=(select auth.uid()));
create schema if not exists uniconnect_private;
revoke all on schema uniconnect_private from public;
grant usage on schema uniconnect_private to authenticated;
create function uniconnect_private.vote_totals() returns table(kind text, item_id uuid, total bigint)
 language sql stable security definer set search_path='' as $$
 select 'poll'::text,option_id,count(*) from public.poll_votes where (select auth.uid()) is not null group by option_id
 union all
 select 'doubt'::text,doubt_id,count(*) from public.doubt_votes where (select auth.uid()) is not null group by doubt_id
 $$;
revoke all on function uniconnect_private.vote_totals() from public,anon;
grant execute on function uniconnect_private.vote_totals() to authenticated;
create function public.vote_totals() returns table(kind text,item_id uuid,total bigint)
 language sql stable security invoker set search_path='' as $$ select * from uniconnect_private.vote_totals() $$;
revoke all on function public.vote_totals() from public,anon;
grant execute on function public.vote_totals() to authenticated;
create function public.create_poll(question_text text, choices text[]) returns uuid
 language plpgsql security invoker set search_path='' as $$
 declare new_id uuid;
 begin
 if coalesce(cardinality(choices),0) not between 2 and 10 or char_length(trim(coalesce(question_text,''))) not between 1 and 500 or exists(select 1 from unnest(choices) c where char_length(trim(coalesce(c,''))) not between 1 and 200) then
 raise exception 'Invalid question or choices';
 end if;
 insert into public.polls(author_id,question) values(auth.uid(),trim(question_text)) returning id into new_id;
 insert into public.poll_options(poll_id,label) select new_id,trim(c) from unnest(choices) c;
 return new_id;
 end $$;
revoke all on function public.create_poll(text,text[]) from public,anon;
grant execute on function public.create_poll(text,text[]) to authenticated;
commit;
