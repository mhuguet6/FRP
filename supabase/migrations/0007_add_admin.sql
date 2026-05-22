-- Añadir marc.huguet.e@gmail.com como admin

insert into staff_emails (email, rol)
values ('marc.huguet.e@gmail.com', 'admin')
on conflict (email) do nothing;
