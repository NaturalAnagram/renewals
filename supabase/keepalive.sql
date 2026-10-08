-- Renewals — keepalive. Run once in the project's SQL Editor.

-- Free-tier projects are paused after a week without activity. The keepalive workflow
-- (.github/workflows/keepalive.yml) calls this every few days through the Data API so the
-- project always has recent requests. It reads nothing; it only proves the database answered.
create function public.keepalive()
returns timestamptz
language sql stable
as $$ select now() $$;

grant execute on function public.keepalive() to anon;
