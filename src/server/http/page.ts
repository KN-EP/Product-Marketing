import "server-only";
import { notFound } from "next/navigation";
import { NotFoundError } from "../errors";

/** For pages: NotFoundError → Next.js 404. */
export async function or404<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}
