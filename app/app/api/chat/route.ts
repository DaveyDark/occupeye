import { NextResponse } from "next/server";

import { getAllRoomStatuses } from "@/lib/occupancy";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const eventType = body.type;

    // 1. Handle bot added to space or DM
    if (eventType === "ADDED_TO_SPACE") {
      return NextResponse.json({
        text: "👋 Welcome to OccupEye! Use the `/rooms` slash command to see real-time physical room availability.",
      });
    }

    // 2. Handle bot removed from space
    if (eventType === "REMOVED_FROM_SPACE") {
      return new Response(null, { status: 200 });
    }

    // 3. Handle message or slash command
    if (eventType === "MESSAGE") {
      const messageText = body.message?.text || "";
      const slashCommandId = body.message?.slashCommand?.commandId;

      // Check if command is /rooms (Command ID 1) or contains /rooms
      if (slashCommandId === "1" || messageText.toLowerCase().includes("/rooms")) {
        const rooms = getAllRoomStatuses();

        const widgets = rooms.map((room) => {
          let stateLabel = "Free";
          let iconUrl = "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/check_circle/default/24px.svg";

          if (room.state === "occupied") {
            stateLabel = "Occupied";
            iconUrl = "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/cancel/default/24px.svg";
          } else if (room.state === "probably_empty") {
            stateLabel = "Probably Empty";
            iconUrl = "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/error/default/24px.svg";
          }

          return {
            decoratedText: {
              startIcon: {
                iconUrl: iconUrl,
              },
              text: `<b>${room.roomName}</b>`,
              bottomLabel: `State: ${stateLabel} | Stream: ${room.roomUrl}`,
            },
          };
        });

        if (widgets.length === 0) {
          widgets.push({
            decoratedText: {
              startIcon: {
                iconUrl: "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/warning/default/24px.svg",
              },
              text: "<b>No rooms found</b>",
              bottomLabel: "Please configure room sources in the OccupEye console.",
            } as any,
          });
        }

        // Return a rich Google Chat Card V2
        return NextResponse.json({
          cardsV2: [
            {
              cardId: "roomsStatusCard",
              card: {
                header: {
                  title: "OccupEye Live Rooms",
                  subtitle: "Real-time room occupancy states",
                  imageUrl: "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/meeting_room/default/48px.svg",
                  imageType: "SQUARE",
                },
                sections: [
                  {
                    header: "Current Availability",
                    collapsible: false,
                    widgets: widgets,
                  },
                ],
              },
            },
          ],
        });
      }

      // Default fallback message for unhandled commands/text
      return NextResponse.json({
        text: "Sorry, I didn't catch that. Type `/rooms` to list available meeting rooms.",
      });
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Error handling Google Chat webhook:", error);
    return NextResponse.json(
      { text: "⚠️ Internal error processing command." },
      { status: 500 },
    );
  }
}
