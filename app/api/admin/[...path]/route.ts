import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  readJson,
  requireAdmin,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { enqueueResearch, redisConnection } from "@/lib/queue";
import { demoMode, limits } from "@/lib/config";
import { countries, profileSchema } from "@/lib/domain";
import { resolvePublic } from "@/lib/research/security";
import { reviewCandidate } from "@/lib/research/review";
import { getPrograms } from "@/lib/catalog";
import { matchProgram } from "@/lib/matching";
import { OpenAIProvider } from "@/lib/ai/openai";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    await requireAdmin();
    const path = (await params).path.join("/");
    if (path !== "dashboard") throw new HttpError(404, "Not found");
    const [universities, jobs, candidates, usage, sourceCount] =
      await Promise.all([
        db.university.findMany({
          include: { sources: true, _count: { select: { programs: true } } },
          orderBy: { name: "asc" },
        }),
        db.researchJob.findMany({
          take: 25,
          orderBy: { createdAt: "desc" },
          include: {
            university: { select: { name: true } },
            logs: { orderBy: { createdAt: "asc" }, take: 100 },
          },
        }),
        db.extractionCandidate.findMany({
          where: { reviewedAt: null },
          take: 30,
          orderBy: { createdAt: "desc" },
          include: {
            document: {
              select: { url: true, title: true, text: true, retrievedAt: true },
            },
          },
        }),
        db.modelUsage.aggregate({
          _sum: { totalTokens: true },
          where: {
            createdAt: { gte: new Date(new Date().toISOString().slice(0, 10)) },
          },
        }),
        db.sourceDocument.count(),
      ]);
    const redis = redisConnection();
    let reserved = 0;
    try {
      reserved = Number(
        (await redis.get(
          "openai:tokens:" + new Date().toISOString().slice(0, 10),
        )) ?? 0,
      );
    } finally {
      await redis.quit();
    }
    return Response.json(
      {
        universities,
        jobs,
        candidates,
        sourceCount,
        tokens: usage._sum.totalTokens ?? 0,
        reservedTokens: reserved,
        tokenLimit: limits().tokens,
        liveEnabled: !!process.env.OPENAI_API_KEY,
        demo: demoMode(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const admin = await requireAdmin();
    const path = (await params).path.join("/");
    const body = await readJson(request);
    if (path === "universities") {
      const data = z
        .object({
          id: z.string().optional(),
          name: z.string().min(3).max(150),
          country: z.enum(countries),
          city: z.string().min(2).max(100),
          officialWebsite: z.string().url(),
        })
        .parse(body);
      const hostname = new URL(data.officialWebsite).hostname;
      await resolvePublic(data.officialWebsite, [
        { hostname, allowSubdomains: false },
      ]);
      const { id, ...fields } = data;
      const university = id
        ? await db.university.update({ where: { id }, data: fields })
        : await db.university.create({
            data: {
              ...fields,
              sources: { create: { hostname, startUrl: data.officialWebsite } },
            },
          });
      return Response.json(university);
    }
    if (path === "sources") {
      const data = z
        .object({
          universityId: z.string(),
          startUrl: z.string().url(),
          allowSubdomains: z.boolean(),
          browserRendering: z.boolean(),
          purpose: z.enum([
            "admissions",
            "scholarship",
            "deadline",
            "metadata",
          ]),
        })
        .parse(body);
      const hostname = new URL(data.startUrl).hostname;
      await resolvePublic(data.startUrl, [
        { hostname, allowSubdomains: data.allowSubdomains },
      ]);
      return Response.json(
        await db.approvedSource.upsert({
          where: {
            universityId_startUrl: {
              universityId: data.universityId,
              startUrl: data.startUrl,
            },
          },
          create: { ...data, hostname },
          update: { ...data, hostname },
        }),
      );
    }
    if (path === "research") {
      if (!process.env.OPENAI_API_KEY)
        throw new HttpError(
          503,
          "Live AI research is disabled. Configure OPENAI_API_KEY before starting a job.",
        );
      const data = z
        .object({
          universityId: z.string(),
          targets: z.array(z.string().min(2).max(150)).min(1).max(5),
        })
        .parse(body);
      await db.university.findUniqueOrThrow({
        where: { id: data.universityId },
      });
      return Response.json(
        await enqueueResearch(data.universityId, data.targets),
        { status: 202 },
      );
    }
    if (path === "review") {
      const data = z
        .object({
          id: z.string(),
          action: z.enum(["APPROVE", "REJECT"]),
          payload: z.unknown().optional(),
          requirementsComplete: z.boolean().default(false),
        })
        .parse(body);
      return Response.json(
        await reviewCandidate(
          data.id,
          data.action,
          admin.administratorIdentity,
          data.payload,
          data.requirementsComplete,
        ),
      );
    }
    if (path === "explain") {
      const data = z
        .object({ programId: z.string(), profile: profileSchema })
        .parse(body);
      const program = (await getPrograms(true)).find(
        (p) => p.id === data.programId && !p.demo,
      );
      if (!program) throw new HttpError(404, "Published real program required");
      const job = await db.researchJob.create({
        data: {
          universityId: program.universityId,
          targets: ["Match explanation"],
          stage: "Extracting",
          status: "EXPLAINING",
        },
      });
      try {
        const explanation = await new OpenAIProvider(job.id).explain(
          matchProgram(program, data.profile),
        );
        const urls = new Set([
          program.officialUrl,
          ...program.requirements.map((r) => r.evidence?.url).filter(Boolean),
          ...program.costs.map((c) => c.evidence?.url).filter(Boolean),
          ...program.scholarships.map((s) => s.evidence?.url).filter(Boolean),
        ]);
        if (explanation.evidenceUrls.some((url) => !urls.has(url)))
          throw new Error("Explanation cited an unsupplied source");
        await db.researchJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            stage: "Completed",
            completedAt: new Date(),
          },
        });
        return Response.json(explanation);
      } catch (error) {
        await db.researchJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            stage: "Failed",
            errors: [String(error)],
            completedAt: new Date(),
          },
        });
        throw error;
      }
    }
    throw new HttpError(404, "Not found");
  } catch (e) {
    return apiError(e);
  }
}
