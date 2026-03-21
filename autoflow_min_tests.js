const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fail(label, error) {
  console.error(`FAIL: ${label}`, error)
  process.exit(1)
}

async function runTests() {
  console.log('TEST 1: create ticket A')
  const { data: ticketA, error: ticketAError } = await supabase
    .from('tickets')
    .insert({ title: 'TEST ticket A' })
    .select()
    .single()

  if (ticketAError) await fail('ticket A create', ticketAError)
  console.log('PASS: ticket A created', ticketA.id)

  console.log('TEST 2: create ticket B')
  const { data: ticketB, error: ticketBError } = await supabase
    .from('tickets')
    .insert({ title: 'TEST ticket B' })
    .select()
    .single()

  if (ticketBError) await fail('ticket B create', ticketBError)
  console.log('PASS: ticket B created', ticketB.id)

  console.log('TEST 3: insert text message into ticket A')
  const { data: textMsg, error: textMsgError } = await supabase
    .from('chat_messages')
    .insert({
      ticket_id: ticketA.id,
      message: 'TEST text message A',
      message_type: 'text'
    })
    .select()
    .single()

  if (textMsgError) await fail('text message insert', textMsgError)
  if (textMsg.ticket_id !== ticketA.id) {
    await fail('text message ticket_id mismatch', {
      expected: ticketA.id,
      actual: textMsg.ticket_id
    })
  }
  console.log('PASS: text message saved')

  console.log('TEST 4: insert image message into ticket A')
  const { data: imageMsg, error: imageMsgError } = await supabase
    .from('chat_messages')
    .insert({
      ticket_id: ticketA.id,
      message: 'TEST image message A',
      message_type: 'image',
      image_url: 'https://example.com/test-image.jpg',
      image_storage_path: 'maintenance/test-image.jpg'
    })
    .select()
    .single()

  if (imageMsgError) await fail('image message insert', imageMsgError)
  if (imageMsg.ticket_id !== ticketA.id) {
    await fail('image message ticket_id mismatch', {
      expected: ticketA.id,
      actual: imageMsg.ticket_id
    })
  }
  if (!imageMsg.image_url) {
    await fail('image_url missing', imageMsg)
  }
  if (imageMsg.message_type !== 'image') {
    await fail('image message_type mismatch', imageMsg)
  }
  console.log('PASS: image message saved')

  console.log('TEST 5: insert text message into ticket B')
  const { data: textMsgB, error: textMsgBError } = await supabase
    .from('chat_messages')
    .insert({
      ticket_id: ticketB.id,
      message: 'TEST text message B',
      message_type: 'text'
    })
    .select()
    .single()

  if (textMsgBError) await fail('ticket B text insert', textMsgBError)
  if (textMsgB.ticket_id !== ticketB.id) {
    await fail('ticket B ticket_id mismatch', {
      expected: ticketB.id,
      actual: textMsgB.ticket_id
    })
  }
  console.log('PASS: ticket B message saved')

  console.log('TEST 6: query only ticket A messages')
  const { data: listA, error: listAError } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('ticket_id', ticketA.id)

  if (listAError) await fail('ticket A query', listAError)
  if (!listA || listA.length < 2) {
    await fail('ticket A messages not enough', listA)
  }
  const wrongInA = listA.find(row => row.ticket_id !== ticketA.id)
  if (wrongInA) {
    await fail('ticket A query contains other ticket data', wrongInA)
  }
  console.log('PASS: ticket A filtered query success')

  console.log('TEST 7: query only ticket B messages')
  const { data: listB, error: listBError } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('ticket_id', ticketB.id)

  if (listBError) await fail('ticket B query', listBError)
  if (!listB || listB.length < 1) {
    await fail('ticket B messages not found', listB)
  }
  const wrongInB = listB.find(row => row.ticket_id !== ticketB.id)
  if (wrongInB) {
    await fail('ticket B query contains other ticket data', wrongInB)
  }
  console.log('PASS: ticket B filtered query success')

  console.log('RESULT: PASS')
}

runTests().catch(err => {
  console.error('FAIL: unexpected error', err)
  process.exit(1)
})