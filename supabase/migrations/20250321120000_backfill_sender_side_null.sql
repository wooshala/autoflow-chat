-- Legacy rows: treat unknown device as pc for alignment
update public.chat_messages
set sender_side = 'pc'
where sender_side is null;
