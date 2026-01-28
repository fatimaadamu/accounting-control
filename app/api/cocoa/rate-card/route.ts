import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  const activeCompanyId = request.cookies.get("activeCompanyId")?.value ?? null;

  if (!date || !activeCompanyId) {
    return NextResponse.json({ rateCard: null, lines: [], message: "Missing date or company." });
  }

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return NextResponse.json({ rateCard: null, lines: [], message: "Invalid date." });
  }
  const ctroDate = parsedDate.toISOString().slice(0, 10);

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

  let rateCard:
    | {
        id: string;
        season: string | null;
        bag_weight_kg: number | null;
        bags_per_tonne?: number | null;
        effective_from: string;
        effective_to: string | null;
      }
    | null = null;
  let rateCardError: { message: string } | null = null;
  const { data: rateCardData, error: rateCardSelectError } = await supabase
    .from("cocoa_rate_cards")
    .select("id, season, bag_weight_kg, bags_per_tonne, effective_from, effective_to")
    .eq("company_id", activeCompanyId)
    .lte("effective_from", ctroDate)
    .or(`effective_to.is.null,effective_to.gte.${ctroDate}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rateCardSelectError && rateCardSelectError.message.includes("bags_per_tonne")) {
    const { data: fallbackCard, error: fallbackError } = await supabase
      .from("cocoa_rate_cards")
      .select("id, season, bag_weight_kg, effective_from, effective_to")
      .eq("company_id", activeCompanyId)
      .lte("effective_from", ctroDate)
      .or(`effective_to.is.null,effective_to.gte.${ctroDate}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    rateCardError = fallbackError ? { message: fallbackError.message } : null;
    rateCard = fallbackCard ? { ...fallbackCard, bags_per_tonne: null } : null;
  } else {
    rateCardError = rateCardSelectError ? { message: rateCardSelectError.message } : null;
    rateCard = rateCardData ?? null;
  }

  if (rateCardError || !rateCard) {
    const { count } = await supabase
      .from("cocoa_rate_cards")
      .select("id", { count: "exact", head: true })
      .eq("company_id", activeCompanyId);
    const hasAnyForCompany = (count ?? 0) > 0;
    return NextResponse.json({
      rateCard: null,
      lines: [],
      message: `No rate card for ${ctroDate} (company ${activeCompanyId}). Any cards for company: ${hasAnyForCompany ? "yes" : "no"}.`,
    });
  }

  const { data: lines, error: linesError } = await supabase
    .from("cocoa_rate_card_lines")
    .select(
        "region_id, district_id, depot_id, takeover_center_id, producer_price_per_tonne, buyer_margin_per_tonne, secondary_evac_cost_per_tonne, takeover_price_per_tonne, created_at"
      )
    .eq("rate_card_id", rateCard.id);

  if (linesError) {
    return NextResponse.json({ rateCard: null, lines: [] });
  }

  const orderedLines = [...(lines ?? [])].sort((a, b) => {
    const aTime = new Date(a.created_at ?? 0).getTime();
    const bTime = new Date(b.created_at ?? 0).getTime();
    return bTime - aTime;
  });

  const uniqueMap = new Map<string, (typeof orderedLines)[number]>();
  let duplicateCount = 0;
  for (const line of orderedLines) {
    const key = `${line.depot_id ?? "null"}:${line.takeover_center_id}`;
    if (uniqueMap.has(key)) {
      duplicateCount += 1;
      continue;
    }
    uniqueMap.set(key, line);
  }
  if (duplicateCount > 0) {
    console.warn(
      `CTRO rate card lines: ${duplicateCount} duplicates ignored for rate_card_id=${rateCard.id}.`
    );
  }

  return NextResponse.json({
    rateCard,
    lines: Array.from(uniqueMap.values()),
  });
}
