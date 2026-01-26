import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ReconciliationBannerProps = {
  title: string;
  description: string;
  controlBalance: number;
  subledgerBalance: number;
  difference: number;
  detailsHref: string;
};

export default function ReconciliationBanner({
  title,
  description,
  controlBalance,
  subledgerBalance,
  difference,
  detailsHref,
}: ReconciliationBannerProps) {
  if (Math.abs(difference) < 0.01) {
    return null;
  }

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardHeader>
        <CardTitle className="text-amber-900">{title}</CardTitle>
        <CardDescription className="text-amber-800">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-amber-900">
        <p>
          Control: {controlBalance.toFixed(2)} | Subledger: {subledgerBalance.toFixed(2)} | Difference:{" "}
          {difference.toFixed(2)}
        </p>
        <Link href={detailsHref} className="text-sm font-medium underline">
          View details
        </Link>
      </CardContent>
    </Card>
  );
}
