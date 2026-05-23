import { NextResponse } from "next/server";
import { getAllPeople } from "@/lib/db";

export async function GET() {
  try {
    const people = getAllPeople();
    
    // Disable caching to get fresh updates on page refresh
    return NextResponse.json(
      { people },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to retrieve people registry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
