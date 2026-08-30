-- IMAGE-CHAT-01A — atomic message + attachment insert (no pending upload tokens).

create or replace function public.create_guest_message_with_attachments(
  p_channel_key     text,
  p_session_id      uuid,
  p_sender          text,
  p_original_text   text,
  p_original_lang   text,
  p_translated_json jsonb,
  p_staff_user_id   uuid,
  p_attachments     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message     guest_chat_messages%rowtype;
  v_attachment  guest_chat_attachments%rowtype;
  v_item        jsonb;
  v_attachments jsonb := '[]'::jsonb;
  v_count       integer;
  v_idx         integer;
begin
  if p_sender not in ('guest', 'staff') then
    raise exception 'INVALID_SENDER' using errcode = 'P0001';
  end if;

  if p_attachments is null or jsonb_typeof(p_attachments) <> 'array' then
    raise exception 'INVALID_ATTACHMENTS' using errcode = 'P0001';
  end if;

  v_count := jsonb_array_length(p_attachments);
  if v_count < 1 or v_count > 1 then
    raise exception 'INVALID_ATTACHMENTS' using errcode = 'P0001';
  end if;

  insert into public.guest_chat_messages (
    channel_key,
    session_id,
    sender,
    original_text,
    original_lang,
    translated_json,
    staff_user_id
  ) values (
    p_channel_key,
    p_session_id,
    p_sender,
    p_original_text,
    p_original_lang,
    coalesce(p_translated_json, '{}'::jsonb),
    case when p_sender = 'staff' then p_staff_user_id else null end
  )
  returning * into v_message;

  for v_idx in 0 .. v_count - 1 loop
    v_item := p_attachments -> v_idx;

    if coalesce(v_item ->> 'storage_path', '') = ''
      or coalesce(v_item ->> 'mime_type', '') = ''
      or (v_item ->> 'size_bytes') is null then
      raise exception 'INVALID_ATTACHMENTS' using errcode = 'P0001';
    end if;

    insert into public.guest_chat_attachments (
      message_id,
      session_id,
      storage_path,
      mime_type,
      size_bytes,
      sort_order
    ) values (
      v_message.id,
      p_session_id,
      v_item ->> 'storage_path',
      v_item ->> 'mime_type',
      (v_item ->> 'size_bytes')::integer,
      coalesce((v_item ->> 'sort_order')::integer, v_idx)
    )
    returning * into v_attachment;

    v_attachments := v_attachments || jsonb_build_array(
      jsonb_build_object(
        'id', v_attachment.id,
        'mime_type', v_attachment.mime_type,
        'size_bytes', v_attachment.size_bytes,
        'sort_order', v_attachment.sort_order,
        'storage_path', v_attachment.storage_path
      )
    );
  end loop;

  return jsonb_build_object(
    'message', jsonb_build_object(
      'id', v_message.id,
      'sender', v_message.sender,
      'original_text', v_message.original_text,
      'original_lang', v_message.original_lang,
      'translated_json', v_message.translated_json,
      'created_at', v_message.created_at,
      'is_deleted', coalesce(v_message.is_deleted, false),
      'deleted_at', v_message.deleted_at,
      'staff_user_id', v_message.staff_user_id
    ),
    'attachments', v_attachments
  );
end;
$$;

comment on function public.create_guest_message_with_attachments is
  'IMAGE-CHAT-01A: atomic guest message + attachment rows (single transaction, server-built paths).';
