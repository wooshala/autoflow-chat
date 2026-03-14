import { NextRequest, NextResponse } from 'next/server';
import { getMockStore } from '@/lib/mock';
import { IS_MOCK } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();

    if (!pin || String(pin).length !== 4) {
      return NextResponse.json({ error: 'PIN은 4자리여야 합니다.' }, { status: 400 });
    }

    if (IS_MOCK || !supabaseAdmin) {
      const user = getMockStore().users.find((u) => u.pin === pin);
      if (!user) {
        return NextResponse.json({ error: '잘못된 PIN입니다.' }, { status: 401 });
      }
      const { pin: _pin, ...safe } = user;
      return NextResponse.json({ user: safe });
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id,name,role,language,created_at')
      .eq('pin', pin)
      .single();

    if (error) {
      return NextResponse.json(
        { error: `LOGIN_DB_ERROR: ${error.message}` },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: '잘못된 PIN입니다.' }, { status: 401 });
    }

    return NextResponse.json({ user: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: `LOGIN_SERVER_ERROR: ${error?.message || 'unknown error'}` },
      { status: 500 }
    );
  }
}