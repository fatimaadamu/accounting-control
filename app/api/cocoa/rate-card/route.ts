import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  const activeCompanyId = request.cookies.get("activeCompanyId")?.value ?? null;

  if (!date || !activeCompanyId) {
    return NextResponse.json({ rateCard: null, lines: [] });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ rateCard: null, lines: [] }, { status: 401 });
  }

  const { data: rateCard, error: rateCardError } = await supabase
    .from("cocoa_rate_cards")
    .select("id, bag_weight_kg, effective_from, effective_to")
    .eq("company_id", activeCompanyId)
    .lte("effective_from", date)
    .or(`effective_to.is.null,effective_to.gte.${date}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rateCardError || !rateCard) {
    return NextResponse.json({ rateCard: null, lines: [] });
  }

  const { data: lines, error: linesError } = await supabase
    .from("cocoa_rate_card_lines")
    .select(
        "region_id, district_id, depot_id, takeover_center_id, producer_price_per_tonne, buyer_margin_per_tonne, secondary_evac_cost_per_tonne, takeover_price_per_tonne"
      )
    .eq("rate_card_id", rateCard.id);

  if (linesError) {
    return NextResponse.json({ rateCard: null, lines: [] });
  }

  return NextResponse.json({
    rateCard,
    lines: lines ?? [],
  });
}
