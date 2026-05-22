-- Permitir que la familia inserte eventos en sus propios expedientes.
-- Los eventos siguen siendo inmutables (no UPDATE/DELETE).

create policy "familia_insert_eventos_propios"
  on eventos for insert
  with check (
    exists (
      select 1 from expedientes e
      where e.id = expediente_id and e.user_id = auth.uid()
    )
  );
