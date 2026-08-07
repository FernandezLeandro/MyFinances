-- Promoción de la cuenta admin real de Lean (alias de Gmail, cuenta separada de su uso personal —
-- ver plan "Rol de administrador"). Falla explícito si la cuenta todavía no existe o no completó
-- el alta (sin perfil), en vez de un UPDATE silencioso que no toca ninguna fila.
do $$
declare
  v_uid uuid;
begin
  select id into v_uid from auth.users where email = 'leanfernandez97+admin@gmail.com';

  if v_uid is null then
    raise exception 'No existe ninguna cuenta con ese email todavía';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'La cuenta existe pero todavía no redimió el código de invitación';
  end if;

  update public.profiles set role = 'admin' where id = v_uid;
end;
$$;
