import { CheckCircle2, Database, Server, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Home() {
  const stack = [
    "Next.js 15 App Router",
    "TypeScript strict mode",
    "Tailwind CSS and shadcn/ui",
    "Prisma with Supabase PostgreSQL",
    "Upstash Redis",
    "Zod environment validation",
  ];

  return (
    <main className="flex flex-1 flex-col bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-6 py-16 sm:px-10">
        <div className="max-w-3xl space-y-5">
          <div className="inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm text-muted-foreground">
            <Zap className="size-4" />
            Production foundation ready
          </div>
          <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
            Next.js 15 starter with typed infrastructure defaults.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            A clean App Router setup with database, cache, validation, styling,
            linting, and formatting conventions already connected.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <a href="https://nextjs.org/docs" target="_blank">
                <Server className="size-4" />
                Next docs
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href="https://www.prisma.io/docs" target="_blank">
                <Database className="size-4" />
                Prisma docs
              </a>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {stack.map((item) => (
            <div
              key={item}
              className="flex min-h-14 items-center gap-3 rounded-md border bg-card px-4 text-card-foreground"
            >
              <CheckCircle2 className="size-5 text-primary" />
              <span className="text-sm font-medium">{item}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
