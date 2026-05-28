import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { WaitlistSignupSchema } from '@/lib/pipeline/schemas'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = WaitlistSignupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('waitlist').upsert(
      {
        email: parsed.data.email,
        disciplines: parsed.data.disciplines,
        region_codes: parsed.data.region_codes,
        source: parsed.data.source ?? null,
      },
      { onConflict: 'email' },
    )

    if (error) {
      console.error('[waitlist] Supabase error:', error.message)
      return NextResponse.json({ error: 'Storage failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[waitlist] Fatal:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
