import { z } from "zod";

/**
 * M12: communication channels and sales channels are different things.
 * Communication channels carry a message to an audience (LinkedIn, email,
 * webinar, website …). Sales channels are the routes through which a deal or
 * a renewal is closed (direct sales, partners and resellers, customer
 * success …). Briefings, strategy briefs and plans keep the two apart.
 */

export const ChannelType = z.enum(["communication", "sales"]);
export type ChannelType = z.infer<typeof ChannelType>;

/** Fixed list: sales channels drive hand-off rules and partner content, so they are not free text. */
export const SalesChannel = z.enum(["direct_sales", "inside_sales", "partner_reseller", "marketplace", "customer_success"]);
export type SalesChannel = z.infer<typeof SalesChannel>;

export const SALES_CHANNEL_LABEL: Record<SalesChannel, string> = {
  direct_sales: "Direct sales",
  inside_sales: "Inside sales",
  partner_reseller: "Partners & resellers",
  marketplace: "Marketplace",
  customer_success: "Customer success (existing customers)",
};

/** Common B2B communication channels offered as checkboxes; anything else is free text. */
export const PRESET_COMMUNICATION_CHANNELS = ["LinkedIn", "Email", "Webinar", "Events", "Website", "Paid search", "Newsletter", "Press"] as const;
