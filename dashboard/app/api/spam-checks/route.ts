import { NextResponse } from "next/server";

export async function GET() {
  const apiUrl = process.env.API_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${apiUrl}/api/spam-checks`, {
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { status: "error", message: "Backend unavailable" },
      { status: 502 }
    );
  }
}
