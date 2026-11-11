-- Pruebas de seguridad de amigos y sugerencias (Supabase, proyecto «biblioteca»).
-- Pegar en el editor SQL de Supabase. Crea tres usuarios de prueba (Ana, Beto y Carla), lo comprueba todo
-- y al final lanza un error a propósito para que NO quede nada guardado. El resultado sale en el mensaje del error.
-- Resultado esperado:
-- 1)existe:ok noexiste:no_account auto:rechazado salientesA=1 tablaDirecta:bloqueada sugNoAmigo:rechazada
-- 2)B ve entrante de:Ana C acepta ajena:rechazado C ve 0 filas 3)B amigo de:Ana C sugiere:rechazada
-- 4)A recibe de:Beto cover=[] extra=no msg=¡Te va a encantar! estado=added trasB=added 5)limite:SI amigosTrasEliminar=0
do $$
declare a uuid:='aaaaaaaa-0000-0000-0000-000000000001'; b uuid:='bbbbbbbb-0000-0000-0000-000000000002'; c uuid:='cccccccc-0000-0000-0000-000000000003';
 out text:=''; n int; rid bigint; t text;
begin
  insert into auth.users(id,aud,role,email,instance_id) values (a,'authenticated','authenticated','ana@prueba.test','00000000-0000-0000-0000-000000000000'),(b,'authenticated','authenticated','beto@prueba.test','00000000-0000-0000-0000-000000000000'),(c,'authenticated','authenticated','carla@prueba.test','00000000-0000-0000-0000-000000000000');
  insert into public.settings(user_id,data) values (a,'{"name":"Ana"}'),(b,'{"name":"Beto"}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated','aal','aal1')::text, true);
  out := out || ' 1)existe:' || public.friend_request('Beto@Prueba.test') || ' noexiste:' || public.friend_request('nadie@prueba.test');
  begin perform public.friend_request('ana@prueba.test'); out:=out||' auto:ACEPTADO'; exception when others then out:=out||' auto:rechazado'; end;
  select count(*) into n from public.friends_list() where kind='outgoing'; out:=out||' salientesA='||n;
  begin perform count(*) from public.friend_requests; out:=out||' tablaDirecta:ACCESIBLE'; exception when others then out:=out||' tablaDirecta:bloqueada'; end;
  begin perform public.suggest_book(b,'{"title":"X"}','hola'); out:=out||' sugNoAmigo:ACEPTADA'; exception when others then out:=out||' sugNoAmigo:rechazada'; end;
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated','aal','aal1')::text, true);
  select id, name into rid, t from public.friends_list() where kind='incoming'; out:=out||' 2)B ve entrante de:'||coalesce(t,'?');
  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated','aal','aal1')::text, true);
  begin perform public.friend_respond(rid,true); out:=out||' C acepta ajena:ACEPTADO'; exception when others then out:=out||' C acepta ajena:rechazado'; end;
  select count(*) into n from public.friends_list(); out:=out||' C ve '||n||' filas';
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated','aal','aal1')::text, true);
  perform public.friend_respond(rid,true);
  select name into t from public.friends_list() where kind='friend'; out:=out||' 3)B amigo de:'||coalesce(t,'?');
  perform public.suggest_book(a,'{"title":"<img src=x onerror=alert(1)>","author":"Autora","cover":"javascript:alert(1)","key":"/works/OL1W","extra":"x"}','¡Te va a encantar!');
  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated','aal','aal1')::text, true);
  begin perform public.suggest_book(a,'{"title":"Spam"}',''); out:=out||' C sugiere:ACEPTADA'; exception when others then out:=out||' C sugiere:rechazada'; end;
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated','aal','aal1')::text, true);
  select from_name||' cover=['||(book->>'cover')||'] extra='||coalesce(book->>'extra','no')||' msg='||message into t from public.suggestions_list() limit 1; out:=out||' 4)A recibe de:'||t;
  select id into rid from public.suggestions_list() limit 1; perform public.suggestion_update(array[rid],'added');
  select status into t from public.suggestions_list() limit 1; out:=out||' estado='||t;
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated','aal','aal1')::text, true);
  perform public.suggestion_update(array[rid],'dismissed');
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated','aal','aal1')::text, true);
  select status into t from public.suggestions_list() limit 1; out:=out||' trasB='||t;
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated','aal','aal1')::text, true);
  begin for n in 1..35 loop perform public.suggest_book(a,'{"title":"L"}',''); end loop; out:=out||' 5)limite:NO'; exception when others then out:=out||' 5)limite:SI'; end;
  select id into rid from public.friends_list() where kind='friend'; perform public.friend_remove(rid);
  select count(*) into n from public.friends_list() where kind='friend'; out:=out||' amigosTrasEliminar='||n;
  execute 'reset role';
  raise exception 'RESULTADO:%', out;
end $$;
