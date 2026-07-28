import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import { getActivePaystackSecret } from '../_shared/paystack.ts'

function json(body: unknown, status = 200) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(url, serviceKey)

    const authHeader = req.headers.get('Authorization') || ''

    if (!authHeader) {
      return json({ error: 'Authorization header missing' }, 401)
    }

    const token = authHeader.replace('Bearer ', '').trim()

    const { data: authData, error: authError } =
      await supabase.auth.getUser(token)

    if (authError || !authData.user) {
      return json({ error: 'Invalid user' }, 401)
    }

    const userId = authData.user.id
    const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', userId)
  .single()

if (profileError || !profile) {
  return json({ error: 'Profile not found' }, 404)
}
