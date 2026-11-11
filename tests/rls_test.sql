-- Pruebas de seguridad de la base de datos (Supabase, proyecto «biblioteca»).
-- Ejecutar en el editor SQL de Supabase. Todo va dentro de una transacción que se deshace al final:
-- no deja usuarios ni datos de prueba. Todas las filas de resultado deben decir lo esperado.
begin;
insert into auth.users (id, aud, role, email, instance_id) values
 ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','prueba-a@example.com','00000000-0000-0000-0000-000000000000'),
 ('22222222-2222-2222-2222-222222222222','authenticated','authenticated','prueba-b@example.com','00000000-0000-0000-0000-000000000000');
create temp table r (n serial, prueba text, esperado text, resultado text);
grant all on r to public; grant all on sequence r_n_seq to public;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}',true);
insert into public.books (id,data) values ('b1','{"title":"Libro de A"}');
insert into r(prueba,esperado,resultado) select 'A (sin 2FA) ve sus libros','1', count(*)::text from public.books;
do $$ begin begin insert into public.books (id,data) values ('x y<script>','{}'); insert into r(prueba,esperado,resultado) values('id con caracteres raros','rechazado','ACEPTADO'); exception when others then insert into r(prueba,esperado,resultado) values('id con caracteres raros','rechazado','rechazado'); end; end $$;
do $$ begin begin insert into public.books (id,data) values ('b2','[1,2]'); insert into r(prueba,esperado,resultado) values('data que no es objeto','rechazado','ACEPTADO'); exception when others then insert into r(prueba,esperado,resultado) values('data que no es objeto','rechazado','rechazado'); end; end $$;
do $$ begin begin update public.books set user_id='22222222-2222-2222-2222-222222222222' where id='b1'; insert into r(prueba,esperado,resultado) values('cambiar el propietario','rechazado','ACEPTADO'); exception when others then insert into r(prueba,esperado,resultado) values('cambiar el propietario','rechazado','rechazado'); end; end $$;
do $$ begin begin insert into public.books (user_id,id,data) values ('22222222-2222-2222-2222-222222222222','b9','{}'); insert into r(prueba,esperado,resultado) values('A crea filas a nombre de B','rechazado','ACEPTADO'); exception when others then insert into r(prueba,esperado,resultado) values('A crea filas a nombre de B','rechazado','rechazado'); end; end $$;

reset role;
insert into auth.mfa_factors (id,user_id,friendly_name,factor_type,status,created_at,updated_at) values (gen_random_uuid(),'11111111-1111-1111-1111-111111111111','test','totp','verified',now(),now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}',true);
insert into r(prueba,esperado,resultado) select 'A con 2FA y sesión sin verificar ve libros','0', count(*)::text from public.books;
do $$ begin begin insert into public.books (id,data) values ('b3','{"title":"x"}'); insert into r(prueba,esperado,resultado) values('A sin verificar escribe','rechazado','ACEPTADO'); exception when others then insert into r(prueba,esperado,resultado) values('A sin verificar escribe','rechazado','rechazado'); end; end $$;
do $$ begin begin perform public.delete_my_account(); insert into r(prueba,esperado,resultado) values('A sin verificar borra la cuenta','rechazado','ACEPTADO'); exception when others then insert into r(prueba,esperado,resultado) values('A sin verificar borra la cuenta','rechazado','rechazado'); end; end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}',true);
insert into r(prueba,esperado,resultado) select 'A verificado (aal2) ve libros','1', count(*)::text from public.books;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1"}',true);
insert into r(prueba,esperado,resultado) select 'B ve libros de A','0', count(*)::text from public.books;
update public.books set data='{"title":"hackeado"}' where id='b1';
reset role;
insert into r(prueba,esperado,resultado) select 'libro de A tras intento de B','Libro de A', (select data->>'title' from public.books where id='b1');
insert into r(prueba,esperado,resultado) select 'anon puede leer books','false', has_table_privilege('anon','public.books','select')::text;
insert into r(prueba,esperado,resultado) select 'anon puede leer settings','false', has_table_privilege('anon','public.settings','select')::text;
insert into r(prueba,esperado,resultado) select 'anon puede borrar cuentas','false', has_function_privilege('anon','public.delete_my_account()','execute')::text;
insert into r(prueba,esperado,resultado) select 'usuarios pueden ejecutar books_limit','false', has_function_privilege('authenticated','public.books_limit()','execute')::text;
select n, prueba, esperado, resultado, case when esperado=resultado then 'OK' else 'FALLO' end as estado from r order by n;
rollback;
