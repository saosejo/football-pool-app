import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const url = `https://api.football-data.org/v4/competitions/${code}/matches?season=2026`;

  console.log(url);

  const res = await fetch(url, {
    headers: {
      "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY!,
    },
  });

  const data = await res.json();

  return NextResponse.json(data, {
    status: res.status,
  });
}