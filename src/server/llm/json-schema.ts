import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";
import { z } from "zod";

type JsonSchema = Record<string, unknown>;

/**
 * Tool input schema derived from the asset's Zod schema, made strict-compatible
 * with the SDK's own transformer (the one zodOutputFormat uses): every object
 * gets additionalProperties:false; constraints the API does not support
 * (minLength, maxItems, …) move into descriptions. Zod re-validates the full
 * schema afterwards, so nothing is lost.
 */
export function toolInputSchema(schema: z.ZodType): JsonSchema {
  const json = z.toJSONSchema(schema, { reused: "ref" }) as JsonSchema;
  delete json.$schema;
  return transformJSONSchema(json) as JsonSchema;
}
