/**
 * @title /api/watch/[id]
 * @notice Get, pause/resume, or delete a single watch owned by the session user.
 * @custom:auth Required session
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { deleteWatch, getWatch, updateWatchStatus } from "@/lib/watches";

const PatchSchema = z.object({
  action: z.enum(["pause", "resume"]),
});

/** @notice GET — fetch one watch by id. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const watch = getWatch(id, userId);
    if (!watch) {
      return NextResponse.json({ error: "Watch not found" }, { status: 404 });
    }
    return NextResponse.json({ watch });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** @notice PATCH — pause or resume watch. Resume may 403 if at active watch limit. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = PatchSchema.parse(await request.json());

    const status = body.action === "pause" ? "paused" : "watching";
    const watch = updateWatchStatus(id, userId, status);
    if (!watch) {
      return NextResponse.json({ error: "Watch not found" }, { status: 404 });
    }
    return NextResponse.json({ watch });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    const status = message.includes("Watch limit") ? 403 : 400;
    return NextResponse.json(
      {
        error: message,
        upgradeUrl: status === 403 ? "/billing" : undefined,
      },
      { status },
    );
  }
}

/** @notice DELETE — permanently remove watch. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const deleted = deleteWatch(id, userId);
    if (!deleted) {
      return NextResponse.json({ error: "Watch not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
