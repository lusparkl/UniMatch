import { z } from "zod";
import { apiError, checkOrigin, HttpError, readJson } from "@/lib/auth";
import {
  destroyUserSession,
  limitAttempts,
  requireUser,
  verifyPassword,
} from "@/lib/account";
import { db } from "@/lib/db";
import { documentKindIds } from "@/lib/documents";
import { profileSchema } from "@/lib/domain";
import { Prisma } from "@/generated/prisma/client";
type Context = { params: Promise<{ path: string[] }> };
const MAX_PRIORITIES = 30;
const route = async (params: Context["params"]) => (await params).path;
export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const [kind] = await route(params);
    if (kind === "profile")
      return Response.json({ profile: user.profile ?? null });
    if (kind === "documents") {
      const documents = await db.userDocument.findMany({
        where: { userId: user.id },
        select: { kind: true, status: true, note: true },
      });
      return Response.json({ documents });
    }
    if (kind === "priorities") {
      const priorities = await db.priority.findMany({
        where: { userId: user.id },
        orderBy: { rank: "asc" },
        select: { programId: true, rank: true, note: true },
      });
      return Response.json({ priorities });
    }
    throw new HttpError(404, "Not found");
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const [kind, id] = await route(params);
    const body = await readJson(request);
    if (kind === "profile") {
      const profile = profileSchema.parse(body);
      await db.user.update({
        where: { id: user.id },
        data: { profile: profile as Prisma.InputJsonValue },
      });
      return Response.json({ ok: true });
    }
    if (kind === "documents" && id) {
      if (!documentKindIds.includes(id))
        throw new HttpError(404, "Unknown document type");
      const { status, note } = z
        .object({
          status: z.enum(["HAVE", "IN_PROGRESS", "NONE"]),
          note: z.string().max(300).nullable().default(null),
        })
        .parse(body);
      if (status === "NONE")
        await db.userDocument.deleteMany({
          where: { userId: user.id, kind: id },
        });
      else
        await db.userDocument.upsert({
          where: { userId_kind: { userId: user.id, kind: id } },
          create: { userId: user.id, kind: id, status, note },
          update: { status, note },
        });
      return Response.json({ ok: true });
    }
    throw new HttpError(404, "Not found");
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const [kind, id] = await route(params);
    const body = await readJson(request);
    if (kind === "priorities" && !id) {
      const { programId } = z
        .object({ programId: z.string().min(1).max(100) })
        .parse(body);
      const existing = await db.priority.findMany({
        where: { userId: user.id },
        orderBy: { rank: "asc" },
      });
      if (existing.some((p) => p.programId === programId))
        return Response.json({ ok: true });
      if (existing.length >= MAX_PRIORITIES)
        throw new HttpError(
          400,
          "You can keep up to " + MAX_PRIORITIES + " priorities",
        );
      await db.priority.create({
        data: {
          userId: user.id,
          programId,
          rank: (existing.at(-1)?.rank ?? 0) + 1,
        },
      });
      return Response.json({ ok: true });
    }
    if (kind === "priorities" && id) {
      // Move one step up or down; ranks stay a gap-free 1..n sequence.
      const { move } = z.object({ move: z.enum(["up", "down"]) }).parse(body);
      await db.$transaction(async (tx) => {
        const list = await tx.priority.findMany({
          where: { userId: user.id },
          orderBy: { rank: "asc" },
        });
        const at = list.findIndex((p) => p.programId === id);
        const to = move === "up" ? at - 1 : at + 1;
        if (at < 0 || to < 0 || to >= list.length) return;
        [list[at], list[to]] = [list[to], list[at]];
        for (const [i, p] of list.entries())
          if (p.rank !== i + 1)
            await tx.priority.update({
              where: { id: p.id },
              data: { rank: i + 1 },
            });
      });
      return Response.json({ ok: true });
    }
    throw new HttpError(404, "Not found");
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const [kind, id] = await route(params);
    if (kind === "priorities" && id) {
      const removed = await db.$transaction(async (tx) => {
        const { count } = await tx.priority.deleteMany({
          where: { userId: user.id, programId: id },
        });
        const list = await tx.priority.findMany({
          where: { userId: user.id },
          orderBy: { rank: "asc" },
        });
        for (const [i, p] of list.entries())
          if (p.rank !== i + 1)
            await tx.priority.update({
              where: { id: p.id },
              data: { rank: i + 1 },
            });
        return count;
      });
      return Response.json({ ok: true, removed });
    }
    if (kind === "profile") {
      await db.user.update({
        where: { id: user.id },
        data: { profile: Prisma.DbNull },
      });
      return Response.json({ ok: true });
    }
    if (kind === "me") {
      // Deleting an account removes every stored detail, so the password is asked again.
      await limitAttempts("auth:delete:" + user.id, 5, 900);
      const { password } = z
        .object({ password: z.string().min(1).max(128) })
        .parse(await readJson(request));
      const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      if (!(await verifyPassword(password, row.passwordHash)))
        throw new HttpError(401, "Password is incorrect");
      await db.user.delete({ where: { id: user.id } });
      await destroyUserSession();
      return Response.json({ ok: true });
    }
    throw new HttpError(404, "Not found");
  } catch (error) {
    return apiError(error);
  }
}
