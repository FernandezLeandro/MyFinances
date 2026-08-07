-- Promoción manual para verificación end-to-end del rol admin (ver plan "Rol de administrador").
-- Cuenta de prueba, no de uso real — se promueve por id directo, no hay otra vía posible ya que el
-- candado de columna bloquea el UPDATE de `role` para cualquier cliente autenticado.
update public.profiles
set role = 'admin'
where id = 'd082217f-af98-4f67-8f8e-650de5209817';
